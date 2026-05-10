import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Inventory from './pages/Inventory';
import GroupDetail from './pages/GroupDetail';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Orders from './pages/Orders';
import Settings from './pages/Settings';
import './App.css';

export default function App() {
 return (
 <BrowserRouter>
 <div className="app">
 <nav className="sidebar">
 <div className="logo">PartTrack</div>
 <NavLink to="/inventory" className={({isActive})=>isActive?'active':''}>Inventory</NavLink>
 <NavLink to="/projects" className={({isActive})=>isActive?'active':''}>Projects</NavLink>
 <NavLink to="/orders" className={({isActive})=>isActive?'active':''}>Orders</NavLink>
 <NavLink to="/settings" className={({isActive})=>isActive?'active':''}>Settings</NavLink>
 </nav>
 <main className="content">
 <Routes>
 <Route path="/" element={<Navigate to="/inventory" replace />} />
 <Route path="/inventory" element={<Inventory />} />
 <Route path="/inventory/group/:id" element={<GroupDetail />} />
 <Route path="/projects" element={<Projects />} />
 <Route path="/projects/:id" element={<ProjectDetail />} />
 <Route path="/orders" element={<Orders />} />
 <Route path="/settings" element={<Settings />} />
 </Routes>
 </main>
 </div>
 </BrowserRouter>
 );
}
