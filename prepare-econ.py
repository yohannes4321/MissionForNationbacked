import argparse
import pickle
import tarfile
from email.parser import BytesHeaderParser
from email.policy import default as default_policy
from email.utils import getaddresses
from pathlib import Path
from typing import Optional

import networkx as nx


def _is_probably_email(s: str) -> bool:
    s = (s or "").strip()
    return "@" in s and " " not in s and len(s) <= 254


def _normalize_email(s: str) -> Optional[str]:
    s = (s or "").strip().lower()
    if not s:
        return None
    # Common placeholder in the CMU corpus.
    if s == "no_address@enron.com":
        return None
    if not _is_probably_email(s):
        return None
    return s


def _is_internal_enron(addr: str) -> bool:
    addr = (addr or "").lower()
    return addr.endswith("@enron.com")


def _iter_tar_members(mail_tar: Path):
    # Use streaming mode to avoid fully unpacking.
    # NOTE: For split archives like *.tar.1.gz, you must first reassemble into a full tarball.
    # This function will raise a clear error if the tar is incomplete/corrupt.
    mode = "r:*"
    with tarfile.open(mail_tar, mode) as tf:
        for member in tf:
            if not member.isfile():
                continue
            # Heuristic: corpus is a directory tree of message files (no extensions required).
            # Skip huge binaries just in case.
            if member.size <= 0 or member.size > 10_000_000:
                continue
            yield tf, member


def build_graph_from_mail_tar(
    mail_tar: Path,
    graph_type: str,
    internal_only: bool,
    max_messages: Optional[int],
) -> nx.Graph:
    if graph_type not in {"directed", "undirected"}:
        raise ValueError("--graph_type must be 'directed' or 'undirected'")

    g: nx.Graph = nx.DiGraph() if graph_type == "directed" else nx.Graph()

    parser = BytesHeaderParser(policy=default_policy)

    n_parsed = 0
    n_skipped = 0

    def add_edge(u: str, v: str, kind: str):
        if u == v:
            return
        if internal_only and not (_is_internal_enron(u) and _is_internal_enron(v)):
            return
        if g.has_edge(u, v):
            ed = g.edges[u, v]
            ed["weight"] = float(ed.get("weight", 0.0)) + 1.0
            key = f"w_{kind}"
            ed[key] = float(ed.get(key, 0.0)) + 1.0
        else:
            g.add_edge(
                u,
                v,
                weight=1.0,
                type="email",
                **{f"w_{kind}": 1.0},
            )

    for tf, member in _iter_tar_members(mail_tar):
        if max_messages is not None and n_parsed >= max_messages:
            break

        try:
            f = tf.extractfile(member)
            if f is None:
                n_skipped += 1
                continue
            raw = f.read()
            msg = parser.parsebytes(raw)

            from_raw = msg.get("From", "")
            from_addrs = getaddresses([from_raw])
            from_addr = _normalize_email(from_addrs[0][1] if from_addrs else "")
            if not from_addr:
                n_skipped += 1
                continue

            to_addrs = [_normalize_email(a) for _, a in getaddresses(msg.get_all("To", []) or [])]
            cc_addrs = [_normalize_email(a) for _, a in getaddresses(msg.get_all("Cc", []) or [])]
            bcc_addrs = [_normalize_email(a) for _, a in getaddresses(msg.get_all("Bcc", []) or [])]

            # Deduplicate per field (avoid repeated recipients in the same header).
            to_set = {a for a in to_addrs if a}
            cc_set = {a for a in cc_addrs if a}
            bcc_set = {a for a in bcc_addrs if a}

            if not (to_set or cc_set or bcc_set):
                n_skipped += 1
                continue

            for r in to_set:
                add_edge(from_addr, r, "to")
            for r in cc_set:
                add_edge(from_addr, r, "cc")
            for r in bcc_set:
                add_edge(from_addr, r, "bcc")

            n_parsed += 1
            if n_parsed % 10_000 == 0:
                print(
                    f"Parsed {n_parsed:,} messages | nodes={g.number_of_nodes():,} edges={g.number_of_edges():,}",
                    flush=True,
                )
        except (tarfile.TarError, OSError, ValueError) as e:
            n_skipped += 1
            if n_skipped % 10_000 == 0:
                print(f"Skipped {n_skipped:,} messages (last error: {e})", flush=True)
            continue

    # Remove self-loops and isolates.
    g.remove_edges_from(nx.selfloop_edges(g))
    try:
        isolates = list(nx.isolates(g))  # works for Graph and DiGraph
    except nx.NetworkXError:
        isolates = []
    if isolates:
        g.remove_nodes_from(isolates)

    # Add node attributes used by SPMiner’s downstream visualization/analysis:
    # - `id`: stable identifier (email address)
    # - `label`: simple domain label (internal/external)
    # - `feat`: lightweight structural features (not required by miner, but helpful for reports)
    for node in g.nodes():
        g.nodes[node]["id"] = node
        g.nodes[node]["label"] = "internal" if _is_internal_enron(node) else "external"

    if g.is_directed():
        for node in g.nodes():
            g.nodes[node]["feat"] = [int(g.in_degree(node)), int(g.out_degree(node))]
    else:
        for node in g.nodes():
            degree = int(g.degree(node))
            clustering = float(nx.clustering(g, node)) if degree > 1 else 0.0
            g.nodes[node]["feat"] = [degree, clustering]

    print("\nMail corpus graph build complete:")
    print(f"- Messages parsed: {n_parsed:,}")
    print(f"- Messages skipped: {n_skipped:,}")
    print(f"- Nodes: {g.number_of_nodes():,}")
    print(f"- Edges: {g.number_of_edges():,}")
    print(f"- Directed: {g.is_directed()}")
    if internal_only:
        print("- Filter: internal_only=True")

    return g


def build_graph_from_edgelist(edgelist_path: Path) -> nx.Graph:
    g = nx.read_edgelist(edgelist_path, nodetype=int)
    print("Original graph:")
    print("Nodes:", g.number_of_nodes())
    print("Edges:", g.number_of_edges())

    g.remove_edges_from(nx.selfloop_edges(g))
    isolates = list(nx.isolates(g))
    g.remove_nodes_from(isolates)

    print("\nAfter cleaning:")
    print("Nodes:", g.number_of_nodes())
    print("Edges:", g.number_of_edges())

    for node in g.nodes():
        degree = g.degree(node)
        clustering = nx.clustering(g, node)
        g.nodes[node]["id"] = str(node)
        g.nodes[node]["label"] = ""
        g.nodes[node]["feat"] = [degree, clustering]

    print("\nFeatures added: degree + clustering coefficient")
    return g


def main():
    parser = argparse.ArgumentParser(
        description="Prepare graphs for SPMiner (.pkl NetworkX format). Supports SNAP edgelists and the CMU Enron mail corpus tarball."
    )
    parser.add_argument(
        "--output",
        default="enron_spminer.pkl",
        help="Output pickle file for SPMiner (default: enron_spminer.pkl)",
    )
    parser.add_argument(
        "--pickle_protocol",
        type=int,
        default=4,
        help="Pickle protocol version for output (default: 4 for Python 3.7+ Docker compatibility).",
    )

    src = parser.add_argument_group("Input source (choose one)")
    src.add_argument(
        "--edgelist",
        default=None,
        help="Path to an edge-list text file (e.g., SNAP email-Enron.txt).",
    )
    src.add_argument(
        "--mail_tar",
        default=None,
        help="Path to CMU Enron mail corpus tarball (e.g., enron_mail_20150507.tar.gz).",
    )
    src.add_argument(
        "--repack_pkl",
        default=None,
        help="Load an existing NetworkX pickle and re-save it with --pickle_protocol (fast, no parsing).",
    )

    mail_opts = parser.add_argument_group("Mail corpus options")
    mail_opts.add_argument(
        "--graph_type",
        choices=["directed", "undirected"],
        default="directed",
        help="Graph type to build from emails (default: directed).",
    )
    mail_opts.add_argument(
        "--internal_only",
        action="store_true",
        help="Keep only edges where both sender and recipient are @enron.com.",
    )
    mail_opts.add_argument(
        "--max_messages",
        type=int,
        default=None,
        help="Debug option: stop after parsing N messages.",
    )

    # Back-compat: previous version used --input for edgelist.
    parser.add_argument(
        "--input",
        default=None,
        help="(Deprecated) Same as --edgelist.",
    )

    args = parser.parse_args()

    output = Path(args.output)
    edgelist = Path(args.edgelist) if args.edgelist else (Path(args.input) if args.input else None)
    mail_tar = Path(args.mail_tar) if args.mail_tar else None
    repack_pkl = Path(args.repack_pkl) if args.repack_pkl else None

    n_sources = sum(x is not None for x in (edgelist, mail_tar, repack_pkl))
    if n_sources != 1:
        raise SystemExit("Error: Provide exactly one of --edgelist/--input OR --mail_tar OR --repack_pkl.")

    if repack_pkl is not None:
        if not repack_pkl.exists():
            raise SystemExit(f"Pickle file not found: {repack_pkl}")
        with repack_pkl.open("rb") as f:
            g = pickle.load(f)
        if not isinstance(g, (nx.Graph, nx.DiGraph)):
            raise SystemExit(f"--repack_pkl must contain a NetworkX Graph/DiGraph, got: {type(g)}")
        print("Repacking existing pickle:")
        print(f"- Input: {repack_pkl}")
        print(f"- Nodes: {g.number_of_nodes():,}")
        print(f"- Edges: {g.number_of_edges():,}")
        print(f"- Directed: {g.is_directed()}")
    elif edgelist is not None:
        if not edgelist.exists():
            raise SystemExit(f"Edge-list file not found: {edgelist}")
        g = build_graph_from_edgelist(edgelist)
    else:
        if not mail_tar.exists():
            raise SystemExit(f"Mail tarball not found: {mail_tar}")
        try:
            g = build_graph_from_mail_tar(
                mail_tar=mail_tar,
                graph_type=args.graph_type,
                internal_only=args.internal_only,
                max_messages=args.max_messages,
            )
        except tarfile.ReadError as e:
            raise SystemExit(
                f"Could not read tarball {mail_tar}.\n"
                f"- If your file is split like '*.tar.1.gz', first reassemble into a full tar.gz.\n"
                f"- Original error: {e}"
            )

    protocol = args.pickle_protocol
    if protocol < 0 or protocol > 5:
        raise SystemExit("--pickle_protocol must be between 0 and 5")
    with output.open("wb") as f:
        pickle.dump(g, f, protocol=protocol)

    print(f"\nSaved as {output}")


if __name__ == "__main__":
    main()
