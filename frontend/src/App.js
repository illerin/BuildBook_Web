import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import PartsLibrary from './pages/PartsLibrary';
import Imports from './pages/Imports';
import Search from './pages/Search';
import Settings from './pages/Settings';
import './App.css';

const APP_VERSION = '0.2.19';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="sidebar">
          <div className="logo">BuildBook_Web <span>v{APP_VERSION}</span></div>
          <NavLink to="/projects" className={({ isActive }) => isActive ? 'active' : ''}>Projects</NavLink>
          <NavLink to="/parts" className={({ isActive }) => isActive ? 'active' : ''}>Parts Library</NavLink>
          <NavLink to="/search" className={({ isActive }) => isActive ? 'active' : ''}>Search</NavLink>
          <NavLink to="/imports" className={({ isActive }) => isActive ? 'active' : ''}>Imports</NavLink>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>Settings</NavLink>
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/inventory/*" element={<Navigate to="/parts" replace />} />
            <Route path="/orders/*" element={<Navigate to="/imports" replace />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/parts" element={<PartsLibrary />} />
            <Route path="/search" element={<Search />} />
            <Route path="/imports" element={<Imports />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
