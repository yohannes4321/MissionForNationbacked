import argparse
import csv
import importlib
import itertools
import json
import os
import subprocess
import time
from pathlib import Path

plt = importlib.import_module("matplotlib.pyplot")
try:
    sns = importlib.import_module("seaborn")
except ImportError:
    sns = None


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run SPMiner comparative experiments (Greedy, MCTS, Beam) and generate Task 2 plots."
    )
    parser.add_argument("--dataset", required=True, help="Path to dataset .pkl graph file")
    parser.add_argument("--model_path", default="ckpt/model.pt", help="Path to trained encoder checkpoint")
    parser.add_argument("--strategies", nargs="+", default=["greedy", "mcts", "beam"],
                        choices=["greedy", "mcts", "beam"], help="Search strategies to compare")
    parser.add_argument("--n_trials", nargs="+", type=int, default=[100, 300],
                        help="Trial values for hyperparameter sweep")
    parser.add_argument("--n_neighborhoods", nargs="+", type=int, default=[200, 500],
                        help="Neighborhood values for hyperparameter sweep")
    parser.add_argument("--beam_width", nargs="+", type=int, default=[3, 5],
                        help="Beam widths (only used when strategy=beam)")
    parser.add_argument("--radius", type=int, default=2)
    parser.add_argument("--min_pattern_size", type=int, default=3)
    parser.add_argument("--max_pattern_size", type=int, default=5)
    parser.add_argument("--out_batch_size", type=int, default=3)
    parser.add_argument("--graph_type", choices=["directed", "undirected"], default="undirected")
    parser.add_argument("--streaming_workers", type=int, default=0)
    parser.add_argument("--batch_size", type=int, default=128)
    parser.add_argument("--run_tag", default="task2", help="Name prefix for output files")
    parser.add_argument("--output_dir", default="results/task2", help="Directory for experiment outputs")
    parser.add_argument("--python_bin", default="python", help="Python executable to run decoder")
    parser.add_argument("--skip_existing", action="store_true", help="Skip configs with existing metrics")
    return parser.parse_args()


def read_pattern_metrics(all_instances_json: Path):
    if not all_instances_json.exists():
        return {
            "pattern_types": 0,
            "pattern_instances": 0,
            "avg_frequency_score": 0.0,
        }

    with all_instances_json.open("r") as f:
        rows = json.load(f)

    pattern_keys = set()
    freq_scores = []
    instances = 0
    for row in rows:
        if row.get("type") == "graph_context":
            continue
        meta = row.get("metadata", {})
        key = meta.get("pattern_key")
        if key:
            pattern_keys.add(key)
        freq = meta.get("frequency_score")
        if isinstance(freq, (int, float)):
            freq_scores.append(float(freq))
        instances += 1

    return {
        "pattern_types": len(pattern_keys),
        "pattern_instances": instances,
        "avg_frequency_score": (sum(freq_scores) / len(freq_scores)) if freq_scores else 0.0,
    }


def ensure_dirs(base_dir: Path):
    base_dir.mkdir(parents=True, exist_ok=True)
    (base_dir / "runs").mkdir(parents=True, exist_ok=True)
    (base_dir / "plots").mkdir(parents=True, exist_ok=True)


def build_experiment_grid(args):
    grid = []
    for strategy, n_trials, n_neigh in itertools.product(
        args.strategies, args.n_trials, args.n_neighborhoods
    ):
        if strategy == "beam":
            for beam_width in args.beam_width:
                grid.append({
                    "strategy": strategy,
                    "n_trials": n_trials,
                    "n_neighborhoods": n_neigh,
                    "beam_width": beam_width,
                })
        else:
            grid.append({
                "strategy": strategy,
                "n_trials": n_trials,
                "n_neighborhoods": n_neigh,
                "beam_width": None,
            })
    return grid


def run_one(args, cfg, out_dir: Path):
    run_id = (
        f"{cfg['strategy']}_trials{cfg['n_trials']}_"
        f"neigh{cfg['n_neighborhoods']}"
        + (f"_beam{cfg['beam_width']}" if cfg["beam_width"] is not None else "")
    )
    run_base = out_dir / "runs" / f"{args.run_tag}_{run_id}"
    out_path = str(run_base) + ".p"
    all_instances_json = Path(str(run_base) + "_all_instances.json")
    log_path = Path(str(run_base) + ".log")

    if args.skip_existing and all_instances_json.exists() and log_path.exists():
        metrics = read_pattern_metrics(all_instances_json)
        return {
            "run_id": run_id,
            "status": "skipped",
            "runtime_sec": None,
            **cfg,
            **metrics,
            "out_json": str(all_instances_json),
            "log": str(log_path),
        }

    cmd = [
        args.python_bin,
        "-m",
        "subgraph_mining.decoder",
        "--dataset", args.dataset,
        "--model_path", args.model_path,
        "--search_strategy", cfg["strategy"],
        "--n_trials", str(cfg["n_trials"]),
        "--n_neighborhoods", str(cfg["n_neighborhoods"]),
        "--radius", str(args.radius),
        "--min_pattern_size", str(args.min_pattern_size),
        "--max_pattern_size", str(args.max_pattern_size),
        "--out_batch_size", str(args.out_batch_size),
        "--graph_type", args.graph_type,
        "--streaming_workers", str(args.streaming_workers),
        "--batch_size", str(args.batch_size),
        "--out_path", out_path,
    ]
    if cfg["beam_width"] is not None:
        cmd.extend(["--beam_width", str(cfg["beam_width"])])

    start = time.perf_counter()
    with log_path.open("w") as log_file:
        proc = subprocess.run(cmd, stdout=log_file, stderr=subprocess.STDOUT)
    runtime_sec = time.perf_counter() - start

    metrics = read_pattern_metrics(all_instances_json)
    status = "ok" if proc.returncode == 0 else f"failed({proc.returncode})"
    return {
        "run_id": run_id,
        "status": status,
        "runtime_sec": round(runtime_sec, 3),
        **cfg,
        **metrics,
        "out_json": str(all_instances_json),
        "log": str(log_path),
    }


def score_row(row):
    # Higher patterns and lower runtime are better.
    runtime = row.get("runtime_sec") or 1e9
    ptypes = row.get("pattern_types") or 0
    pinstances = row.get("pattern_instances") or 0
    return (ptypes * 1000) + pinstances - runtime


def write_outputs(rows, out_dir: Path, run_tag: str):
    csv_path = out_dir / f"{run_tag}_metrics.csv"
    fields = [
        "run_id", "status", "strategy", "n_trials", "n_neighborhoods", "beam_width",
        "runtime_sec", "pattern_types", "pattern_instances", "avg_frequency_score",
        "out_json", "log",
    ]
    with csv_path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)

    ok_rows = [r for r in rows if r["status"] == "ok"]
    if not ok_rows:
        return csv_path, None, None, None

    if sns is not None:
        sns.set_style("whitegrid")

    # Plot 1: Search strategy vs runtime
    plt.figure(figsize=(9, 5))
    if sns is not None:
        sns.boxplot(data=ok_rows, x="strategy", y="runtime_sec")
        sns.stripplot(data=ok_rows, x="strategy", y="runtime_sec", color="black", alpha=0.6, jitter=0.15)
    else:
        strategies = sorted(set(r["strategy"] for r in ok_rows))
        points = [[r["runtime_sec"] for r in ok_rows if r["strategy"] == s] for s in strategies]
        plt.boxplot(points, labels=strategies)
        for i, vals in enumerate(points, start=1):
            plt.scatter([i] * len(vals), vals, color="black", alpha=0.5, s=12)
    plt.title("Search Strategy vs Runtime")
    plt.xlabel("Search Strategy")
    plt.ylabel("Runtime (seconds)")
    runtime_plot = out_dir / "plots" / f"{run_tag}_strategy_vs_runtime.png"
    plt.tight_layout()
    plt.savefig(runtime_plot, dpi=180)
    plt.close()

    # Plot 2: Config tuning vs number of patterns found
    plt.figure(figsize=(10, 6))
    for strategy in sorted(set(r["strategy"] for r in ok_rows)):
        subset = [r for r in ok_rows if r["strategy"] == strategy]
        x = [r["n_trials"] for r in subset]
        y = [r["pattern_types"] for r in subset]
        sizes = [max(25, int(r["n_neighborhoods"] / 5)) for r in subset]
        plt.scatter(x, y, s=sizes, alpha=0.75, label=strategy)
    plt.title("Configuration Tuning vs Number of Patterns Found")
    plt.xlabel("n_trials")
    plt.ylabel("Number of Pattern Types Found")
    plt.legend(title="Strategy")
    tune_plot = out_dir / "plots" / f"{run_tag}_config_vs_patterns.png"
    plt.tight_layout()
    plt.savefig(tune_plot, dpi=180)
    plt.close()

    best_config = max(ok_rows, key=score_row)

    by_algo = {}
    for strategy in sorted(set(r["strategy"] for r in ok_rows)):
        subset = [r for r in ok_rows if r["strategy"] == strategy]
        by_algo[strategy] = {
            "avg_runtime_sec": sum(r["runtime_sec"] for r in subset) / len(subset),
            "avg_pattern_types": sum(r["pattern_types"] for r in subset) / len(subset),
            "avg_pattern_instances": sum(r["pattern_instances"] for r in subset) / len(subset),
        }
    best_algo = max(
        by_algo.items(),
        key=lambda kv: (kv[1]["avg_pattern_types"] * 1000) + kv[1]["avg_pattern_instances"] - kv[1]["avg_runtime_sec"],
    )

    summary_path = out_dir / f"{run_tag}_summary.md"
    with summary_path.open("w") as f:
        f.write("# Task 2 Comparative Analysis\n\n")
        f.write("## Best Config\n")
        f.write(
            f"- run_id: `{best_config['run_id']}`\n"
            f"- strategy: `{best_config['strategy']}`\n"
            f"- n_trials: `{best_config['n_trials']}`\n"
            f"- n_neighborhoods: `{best_config['n_neighborhoods']}`\n"
            f"- beam_width: `{best_config['beam_width']}`\n"
            f"- runtime_sec: `{best_config['runtime_sec']}`\n"
            f"- pattern_types: `{best_config['pattern_types']}`\n"
            f"- pattern_instances: `{best_config['pattern_instances']}`\n\n"
        )

        f.write("## Best Algorithm\n")
        f.write(f"- strategy: `{best_algo[0]}`\n")
        f.write(f"- avg_runtime_sec: `{best_algo[1]['avg_runtime_sec']:.3f}`\n")
        f.write(f"- avg_pattern_types: `{best_algo[1]['avg_pattern_types']:.3f}`\n")
        f.write(f"- avg_pattern_instances: `{best_algo[1]['avg_pattern_instances']:.3f}`\n\n")

        f.write("## Selection Rationale\n")
        f.write("- Best Config balances high pattern discovery with acceptable runtime.\n")
        f.write("- Best Algorithm is chosen by average discovery-vs-runtime performance across all tested configs.\n")

    return csv_path, runtime_plot, tune_plot, summary_path


def main():
    args = parse_args()
    out_dir = Path(args.output_dir)
    ensure_dirs(out_dir)

    if not Path(args.dataset).exists():
        raise FileNotFoundError(f"Dataset not found: {args.dataset}")
    if not Path(args.model_path).exists():
        raise FileNotFoundError(f"Model checkpoint not found: {args.model_path}")

    configs = build_experiment_grid(args)
    rows = []
    for i, cfg in enumerate(configs, start=1):
        print(f"[{i}/{len(configs)}] Running {cfg}", flush=True)
        row = run_one(args, cfg, out_dir)
        rows.append(row)
        print(
            f"  -> status={row['status']} runtime={row['runtime_sec']}s "
            f"pattern_types={row['pattern_types']} pattern_instances={row['pattern_instances']}",
            flush=True,
        )

    csv_path, runtime_plot, tune_plot, summary_path = write_outputs(rows, out_dir, args.run_tag)

    print("\n=== Task 2 outputs ===")
    print(f"Metrics CSV: {csv_path}")
    if runtime_plot:
        print(f"Runtime plot: {runtime_plot}")
    if tune_plot:
        print(f"Config-vs-pattern plot: {tune_plot}")
    if summary_path:
        print(f"Best config/algorithm summary: {summary_path}")


if __name__ == "__main__":
    main()
