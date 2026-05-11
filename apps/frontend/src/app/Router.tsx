import { Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { Overview } from '../pages/Overview'
import { Hosts } from '../pages/Hosts'
import { Items } from '../pages/Items'

export function AppRouter() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/hosts" element={<Hosts />} />
        <Route path="/items" element={<Items />} />
      </Routes>
    </AppShell>
  )
}

