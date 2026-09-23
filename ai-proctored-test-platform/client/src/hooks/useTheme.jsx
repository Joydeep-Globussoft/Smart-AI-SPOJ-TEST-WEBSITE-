import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ThemeContext = createContext({
  theme: 'dark',
  isDark: true,
  toggleTheme: () => {},
  setTheme: () => {},
});

export const ThemeProvider = ({ children }) => {
  const location = useLocation();
  const isCandidateRoute = location.pathname.startsWith('/candidate');

  const [adminTheme, setAdminThemeState] = useState(() => {
    try {
      const v = localStorage.getItem('theme_version');
      if (v !== '2') {
        localStorage.setItem('theme_version', '2');
        localStorage.setItem('admin_theme', 'dark');
        return 'dark';
      }
      const stored = localStorage.getItem('admin_theme');
      return stored === 'light' ? 'light' : 'dark';
    } catch (_) {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      if (isCandidateRoute) {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        localStorage.setItem('theme_version', '2');
        localStorage.setItem('admin_theme', adminTheme);
        document.documentElement.setAttribute('data-theme', adminTheme);
      }
    } catch (_) {}
  }, [adminTheme, isCandidateRoute, location.pathname]);

  const toggleTheme = () => {
    setAdminThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (newTheme) => {
    if (newTheme === 'dark' || newTheme === 'light') {
      setAdminThemeState(newTheme);
    }
  };

  const activeTheme = isCandidateRoute ? 'light' : adminTheme;

  return (
    <ThemeContext.Provider
      value={{
        theme: activeTheme,
        isDark: activeTheme === 'dark',
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
export default useTheme;
