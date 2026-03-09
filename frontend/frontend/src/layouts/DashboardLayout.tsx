import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { logout } from '../store/authSlice';
import { 
  LayoutDashboard, 
  MapPin, 
  Mail, 
  FileText, 
  LogOut, 
  Church, 
  ChevronRight 
} from 'lucide-react';

export default function DashboardLayout() {
  const { user } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  // Strict check for the 'super' role from your backend
  const isSuper = user?.role === 'super';

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, show: true },
    { name: 'Regions', path: '/regions', icon: MapPin, show: isSuper },
    { name: 'Invitations', path: '/invitations', icon: Mail, show: isSuper },
    { name: 'Posts', path: '/posts', icon: FileText, show: true },
  ];

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-[#f5f5f5]">
      {/* Sidebar - Forest Green */}
      <aside className="w-72 bg-[#1a3c34] text-white flex flex-col shadow-2xl">
        {/* Logo Section */}
        <div className="p-8 flex items-center space-x-3 border-b border-white/5">
          <div className="bg-[#d4af37] p-2 rounded-lg">
            <Church className="text-[#1a3c34] w-6 h-6" />
          </div>
          <span className="text-xl font-bold tracking-tight text-[#f5f5f5]">MFN Admin</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {menuItems.filter(item => item.show).map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between p-3 rounded-xl transition-all duration-200 group ${
                  isActive 
                  ? 'bg-[#d4af37] text-[#1a3c34] font-bold shadow-lg shadow-black/20' 
                  : 'hover:bg-white/10 text-white/70 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <item.icon size={20} className={isActive ? 'text-[#1a3c34]' : 'text-[#d4af37]'} />
                  <span>{item.name}</span>
                </div>
                {isActive && <ChevronRight size={16} />}
              </Link>
            );
          })}
        </nav>

        {/* User Profile / Logout Section */}
        <div className="p-6 border-t border-white/5 bg-[#142e28]">
          <div className="mb-4">
            <p className="text-[10px] text-[#d4af37] font-black uppercase tracking-widest mb-1">
              Account Type: {user?.role}
            </p>
            <p className="text-sm truncate text-[#f5f5f5] opacity-80">{user?.email}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center space-x-2 w-full p-3 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all font-medium text-sm"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <header className="h-20 bg-white border-b border-gray-200 flex items-center px-10 justify-between">
          <h2 className="text-lg font-semibold text-[#1a3c34]">
            {menuItems.find(i => i.path === location.pathname)?.name || 'Dashboard'}
          </h2>
        </header>
        
        <div className="p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}