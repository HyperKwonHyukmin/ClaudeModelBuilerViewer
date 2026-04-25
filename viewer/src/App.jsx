import Toolbar from './components/Toolbar.jsx'
import Sidebar from './components/Sidebar.jsx'
import ViewportContainer from './components/ViewportContainer.jsx'
import InspectorPanel from './components/InspectorPanel.jsx'
import DiffTable from './components/DiffTable.jsx'

export default function App() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: '#0d0d1a', color: '#e0e0e0', overflow: 'hidden' }}>
      <Toolbar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <ViewportContainer />
          <DiffTable />
        </div>
        <InspectorPanel />
      </div>
    </div>
  )
}
