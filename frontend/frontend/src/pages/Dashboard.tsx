export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-3xl font-bold text-[#1a3c34]">Welcome back!</h1>
        <p className="text-gray-500 mt-2">Here is what is happening with Mission For Nation today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {['Total Regions', 'Active Posts', 'Pending Invites'].map((stat) => (
          <div key={stat} className="bg-white p-6 rounded-2xl shadow-sm border-b-4 border-[#d4af37]">
            <p className="text-sm text-gray-400 font-medium uppercase tracking-wider">{stat}</p>
            <p className="text-3xl font-bold text-[#1a3c34] mt-2">--</p>
          </div>
        ))}
      </div>
    </div>
  );
}