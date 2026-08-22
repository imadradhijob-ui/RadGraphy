import React, { useState, useEffect } from 'react';
import {
  Server,
  Search,
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Database,
  Radio,
  Calendar,
  Clock,
  Edit2,
  Save,
  Sliders,
  Settings2,
  RotateCcw,
  Filter,
  Wifi,
  CalendarRange,
  User,
  Hash,
  FileText,
  ArrowRight
} from 'lucide-react';
import { DicomStudy, PacsSearchResult, PacsServerConfig } from '../types/dicom';
import { PacsService } from '../services/pacsClient';

interface PacsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStudyRetrieved: (study: DicomStudy) => void;
}

export const PacsManagerModal: React.FC<PacsManagerModalProps> = ({
  isOpen,
  onClose,
  onStudyRetrieved
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'servers'>('search');
  const [servers, setServers] = useState<PacsServerConfig[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');

  // Search filter states
  const [patientName, setPatientName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [modality, setModality] = useState('ALL');
  const [accessionNumber, setAccessionNumber] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeDatePreset, setActiveDatePreset] = useState<string>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PacsSearchResult[]>([]);

  // Downloading state
  const [downloadingUid, setDownloadingUid] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Server management states
  const [isTestingEcho, setIsTestingEcho] = useState<string | null>(null);
  const [echoResult, setEchoResult] = useState<{ [serverId: string]: { success: boolean; message: string } }>({});
  
  // Adding server state
  const [isAddingServer, setIsAddingServer] = useState(false);
  const [newServer, setNewServer] = useState<Partial<PacsServerConfig>>({
    name: 'New Hospital PACS',
    aeTitle: 'INFOMED',
    callingAeTitle: 'RADIANT_VIEWER',
    host: '170.16.0.2',
    port: 2025,
    cStorePort: 11112,
    retrieveMethod: 'c-move',
    protocol: 'dimse'
  });

  // Editing server state
  const [editingServer, setEditingServer] = useState<PacsServerConfig | null>(null);
  const [editForm, setEditForm] = useState<Partial<PacsServerConfig>>({});

  useEffect(() => {
    const loaded = PacsService.getServers();
    setServers(loaded);
    if (loaded.length > 0) {
      // Always prefer the Alshaab PACS server as the default selection
      const alshaab = loaded.find(s => s.id === 'pacs_alshaab');
      setSelectedServerId(alshaab ? alshaab.id : loaded[0].id);
    }
    // Always reset date filters when modal opens so the user sees all data
    setDateFrom('');
    setDateTo('');
    setActiveDatePreset('all');
    setSearchResults([]);
    setStatusMessage('Ready — press Query to search the PACS server');
    setEditingServer(null);
    setIsAddingServer(false);
  }, [isOpen]);

  const setDatePreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all') => {
    setActiveDatePreset(preset);
    const formatDate = (d: Date): string => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const today = new Date();

    if (preset === 'today') {
      const formatted = formatDate(today);
      setDateFrom(formatted);
      setDateTo(formatted);
    } else if (preset === 'yesterday') {
      const yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      const formatted = formatDate(yest);
      setDateFrom(formatted);
      setDateTo(formatted);
    } else if (preset === 'week') {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      setDateFrom(formatDate(weekAgo));
      setDateTo(formatDate(today));
    } else if (preset === 'month') {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      setDateFrom(formatDate(monthAgo));
      setDateTo(formatDate(today));
    } else if (preset === 'year') {
      const yearAgo = new Date(today);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      setDateFrom(formatDate(yearAgo));
      setDateTo(formatDate(today));
    } else if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    }
  };

  const handleResetFilters = () => {
    setPatientName('');
    setPatientId('');
    setAccessionNumber('');
    setModality('ALL');
    setDateFrom('');
    setDateTo('');
    setActiveDatePreset('all');
    setStatusMessage('Filters reset. Ready to query PACS.');
  };

  if (!isOpen) return null;

  const handleSearch = async () => {
    const server = servers.find(s => s.id === selectedServerId);
    if (!server) {
      setStatusMessage(`ERROR: No server selected (selectedServerId="${selectedServerId}", available=[${servers.map(s=>s.id).join(',')}])`);
      return;
    }

    setIsSearching(true);
    setStatusMessage(`Querying ${server.name} (${server.host}:${server.port}) via DICOM C-FIND...`);
    try {
      const results = await PacsService.searchStudies(server, {
        patientName,
        patientId,
        modality,
        accessionNumber,
        dateFrom,
        dateTo
      });
      setSearchResults(results);

      if (results.length === 0 && (dateFrom || dateTo)) {
        setStatusMessage('No studies found for the selected date range. Try "All Dates" or a wider range.');
      } else {
        setStatusMessage(`Found ${results.length} studies from ${server.name}.`);
      }
    } catch (err: any) {
      setStatusMessage(`Search failed: ${err.message || err}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleRetrieve = async (result: PacsSearchResult) => {
    setDownloadingUid(result.studyInstanceUid);
    setDownloadProgress(10);
    setStatusMessage('Connecting to PACS & discovering all series...');
    try {
      const study = await PacsService.retrieveStudy(
        result,
        (progress, msg) => {
          setDownloadProgress(progress);
          setStatusMessage(msg);
        },
        (initialStudy) => {
          onStudyRetrieved(initialStudy);
        },
        (updatedStudy) => {
          onStudyRetrieved(updatedStudy);
        }
      );
      onStudyRetrieved(study);
      onClose();
    } catch (err: any) {
      setStatusMessage(`Download failed: ${err.message || err}`);
    } finally {
      setDownloadingUid(null);
    }
  };

  const handleTestEcho = async (server: PacsServerConfig) => {
    setIsTestingEcho(server.id);
    try {
      const res = await PacsService.testEcho(server);
      setEchoResult(prev => ({ ...prev, [server.id]: { success: res.success, message: res.message } }));
    } catch (err: any) {
      setEchoResult(prev => ({ ...prev, [server.id]: { success: false, message: 'Connection failed' } }));
    } finally {
      setIsTestingEcho(null);
    }
  };

  const handleStartEdit = (server: PacsServerConfig) => {
    setEditingServer(server);
    setEditForm({
      ...server,
      cStorePort: server.cStorePort || 11112,
      retrieveMethod: server.retrieveMethod || 'c-move'
    });
    setIsAddingServer(false);
  };

  const handleSaveEditedServer = () => {
    if (!editingServer || !editForm.name || !editForm.host || !editForm.port || !editForm.aeTitle) return;
    
    const updatedServer: PacsServerConfig = {
      ...editingServer,
      name: editForm.name,
      aeTitle: editForm.aeTitle.trim(),
      callingAeTitle: (editForm.callingAeTitle || 'RADIANT_VIEWER').trim(),
      host: editForm.host.trim(),
      port: Number(editForm.port),
      cStorePort: Number(editForm.cStorePort || 11112),
      retrieveMethod: editForm.retrieveMethod || 'c-move',
      protocol: editForm.protocol || 'dimse',
      wadoUrl: editForm.wadoUrl?.trim(),
      qidoUrl: editForm.qidoUrl?.trim()
    };

    const updated = servers.map(s => s.id === updatedServer.id ? updatedServer : s);
    setServers(updated);
    PacsService.saveServers(updated);
    setEditingServer(null);
    setStatusMessage(`Saved settings for PACS: ${updatedServer.name}`);
  };

  const handleSaveNewServer = () => {
    if (!newServer.name || !newServer.host || !newServer.port || !newServer.aeTitle) return;
    const s: PacsServerConfig = {
      id: `pacs_${Date.now()}`,
      name: newServer.name,
      aeTitle: newServer.aeTitle.trim(),
      callingAeTitle: (newServer.callingAeTitle || 'RADIANT_VIEWER').trim(),
      host: newServer.host.trim(),
      port: Number(newServer.port),
      cStorePort: Number(newServer.cStorePort || 11112),
      retrieveMethod: newServer.retrieveMethod || 'c-move',
      protocol: newServer.protocol as any || 'dimse',
      wadoUrl: newServer.wadoUrl?.trim(),
      qidoUrl: newServer.qidoUrl?.trim()
    };
    const updated = [...servers, s];
    setServers(updated);
    PacsService.saveServers(updated);
    setIsAddingServer(false);
    setSelectedServerId(s.id);
  };

  const handleDeleteServer = (id: string) => {
    const updated = servers.filter(s => s.id !== id);
    setServers(updated);
    PacsService.saveServers(updated);
    if (selectedServerId === id && updated.length > 0) {
      setSelectedServerId(updated[0].id);
    }
  };

  const currentSelectedServer = servers.find(s => s.id === selectedServerId);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-radiant-panel border border-radiant-border rounded-xl shadow-2xl w-full max-w-5xl h-[740px] max-h-[92vh] flex flex-col overflow-hidden text-xs text-slate-200">
        {/* Modal Header */}
        <div className="h-12 bg-radiant-darkest border-b border-radiant-border px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-cyan-400">
            <Server className="w-5 h-5 text-cyan-300" />
            <span>PACS Query / Retrieve Workstation</span>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-radiant-hover text-slate-400 hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="h-10 bg-radiant-dark border-b border-radiant-border px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('search')}
              className={`px-3 py-1.5 rounded-t text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'search'
                  ? 'border-cyan-400 text-cyan-300 bg-radiant-panel'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>C-FIND Search</span>
            </button>

            <button
              onClick={() => setActiveTab('servers')}
              className={`px-3 py-1.5 rounded-t text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'servers'
                  ? 'border-cyan-400 text-cyan-300 bg-radiant-panel'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>PACS Server Nodes & Settings</span>
            </button>
          </div>

          {currentSelectedServer && activeTab === 'search' && (
            <button
              onClick={() => {
                setActiveTab('servers');
                handleStartEdit(currentSelectedServer);
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-cyan-500 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors"
              title="Edit selected PACS node settings directly"
            >
              <Edit2 className="w-3 h-3" />
              <span>Configure {currentSelectedServer.name}</span>
            </button>
          )}
        </div>

        {/* Tab 1: Search & Retrieve */}
        {activeTab === 'search' && (
          <div className="flex-1 flex flex-col p-4 overflow-hidden gap-3">
            {/* Server Selector & Search Controls Card */}
            <div className="bg-radiant-card border border-radiant-border rounded-xl p-3.5 space-y-3 shadow-lg">
              {/* Row 1: Target PACS Server & Connection Status */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-radiant-darkest/70 border border-radiant-border/80 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
                  <Database className="w-4 h-4 text-cyan-400 shrink-0" />
                  <label className="font-semibold text-slate-200 text-xs shrink-0">PACS Node:</label>
                  <select
                    value={selectedServerId}
                    onChange={(e) => setSelectedServerId(e.target.value)}
                    className="bg-radiant-panel border border-radiant-border rounded-md px-3 py-1.5 text-slate-100 font-semibold focus:border-cyan-400 focus:outline-none flex-1 max-w-sm text-xs shadow-inner cursor-pointer"
                  >
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.aeTitle} @ {s.host}:{s.port})
                      </option>
                    ))}
                  </select>
                </div>

                {currentSelectedServer && (
                  <div className="flex items-center gap-2">
                    <div className="hidden md:flex items-center gap-2 px-2.5 py-1 bg-slate-900/80 border border-slate-800 rounded text-[11px] font-mono text-slate-300">
                      <span><span className="text-slate-500">Host:</span> <strong className="text-slate-200">{currentSelectedServer.host}:{currentSelectedServer.port}</strong></span>
                      <span className="text-slate-600">|</span>
                      <span><span className="text-slate-500">Called:</span> <strong className="text-cyan-300">{currentSelectedServer.aeTitle}</strong></span>
                      <span className="text-slate-600">|</span>
                      <span><span className="text-slate-500">Calling:</span> <strong className="text-amber-300">{currentSelectedServer.callingAeTitle}</strong></span>
                    </div>

                    {/* Test Ping Button */}
                    <button
                      type="button"
                      onClick={() => handleTestEcho(currentSelectedServer)}
                      disabled={isTestingEcho === currentSelectedServer.id}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-cyan-500 rounded text-[11px] font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                      title="Send DICOM C-ECHO verification ping"
                    >
                      <Wifi className={`w-3.5 h-3.5 ${isTestingEcho === currentSelectedServer.id ? 'animate-pulse text-amber-400' : 'text-emerald-400'}`} />
                      <span>{isTestingEcho === currentSelectedServer.id ? 'Pinging...' : 'C-ECHO'}</span>
                    </button>

                    {echoResult[currentSelectedServer.id] && (
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${
                        echoResult[currentSelectedServer.id].success
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                          : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                      }`}>
                        {echoResult[currentSelectedServer.id].success ? '✓ Echo OK' : '✗ Failed'}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Row 2: Search Filters (Patient Name, Patient ID, Accession, Modality) */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                {/* Patient Name */}
                <div className="md:col-span-4">
                  <label className="text-[11px] text-slate-300 flex items-center gap-1 mb-1 font-medium">
                    <User className="w-3 h-3 text-cyan-400" />
                    <span>Patient Name</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. Ali mohan or AL-SAADI*"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="w-full bg-radiant-darkest border border-radiant-border rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 focus:outline-none transition-all shadow-inner"
                    />
                    {patientName && (
                      <button
                        type="button"
                        onClick={() => setPatientName('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Patient ID */}
                <div className="md:col-span-3">
                  <label className="text-[11px] text-slate-300 flex items-center gap-1 mb-1 font-medium">
                    <Hash className="w-3 h-3 text-amber-400" />
                    <span>Patient ID</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="e.g. 566203 or PAT*"
                      value={patientId}
                      onChange={(e) => setPatientId(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="w-full bg-radiant-darkest border border-radiant-border rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 focus:outline-none transition-all shadow-inner font-mono"
                    />
                    {patientId && (
                      <button
                        type="button"
                        onClick={() => setPatientId('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Accession Number */}
                <div className="md:col-span-3">
                  <label className="text-[11px] text-slate-300 flex items-center gap-1 mb-1 font-medium">
                    <FileText className="w-3 h-3 text-purple-400" />
                    <span>Accession Number</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ACC-2026-*"
                    value={accessionNumber}
                    onChange={(e) => setAccessionNumber(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full bg-radiant-darkest border border-radiant-border rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 focus:outline-none transition-all shadow-inner font-mono"
                  />
                </div>

                {/* Modality */}
                <div className="md:col-span-2">
                  <label className="text-[11px] text-slate-300 flex items-center gap-1 mb-1 font-medium">
                    <Filter className="w-3 h-3 text-emerald-400" />
                    <span>Modality</span>
                  </label>
                  <select
                    value={modality}
                    onChange={(e) => setModality(e.target.value)}
                    className="w-full bg-radiant-darkest border border-radiant-border rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none font-semibold cursor-pointer shadow-inner"
                  >
                    <option value="ALL">ALL (Any)</option>
                    <option value="CT">CT (Computed Tomography)</option>
                    <option value="MR">MR (Magnetic Resonance)</option>
                    <option value="DX">DX / CR (Digital X-Ray)</option>
                    <option value="US">US (Ultrasound)</option>
                    <option value="XA">XA (Angiography)</option>
                    <option value="MG">MG (Mammography)</option>
                    <option value="NM">NM (Nuclear Medicine)</option>
                    <option value="PT">PT (PET Scan)</option>
                    <option value="OT">OT (Other)</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Date Range Filter & Query Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-radiant-border/60">
                {/* Date Controls (Presets & Range Pickers) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-300">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span>Date Range:</span>
                  </div>

                  {/* Preset Pills */}
                  <div className="flex items-center bg-radiant-darkest border border-radiant-border rounded-lg p-0.5 gap-0.5">
                    {[
                      { id: 'all', label: 'All Dates' },
                      { id: 'today', label: 'Today' },
                      { id: 'yesterday', label: 'Yesterday' },
                      { id: 'week', label: '7 Days' },
                      { id: 'month', label: '30 Days' },
                      { id: 'year', label: '1 Year' }
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setDatePreset(p.id as any)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                          activeDatePreset === p.id
                            ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold shadow-sm'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-radiant-hover'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* From & To Custom Date Inputs */}
                  <div className="flex items-center gap-1.5 bg-radiant-darkest border border-radiant-border rounded-lg px-2.5 py-1">
                    <span className="text-[11px] text-slate-400 font-medium">From:</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        setActiveDatePreset('custom');
                      }}
                      className="bg-transparent border-0 text-slate-200 text-xs focus:outline-none font-mono cursor-pointer"
                    />
                    <span className="text-slate-500 font-bold">→</span>
                    <span className="text-[11px] text-slate-400 font-medium">To:</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value);
                        setActiveDatePreset('custom');
                      }}
                      className="bg-transparent border-0 text-slate-200 text-xs focus:outline-none font-mono cursor-pointer"
                    />
                  </div>
                </div>

                {/* Main Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="h-9 px-3 bg-radiant-darkest hover:bg-radiant-hover text-slate-300 hover:text-white border border-radiant-border rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                    title="Reset all search fields and date range"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Reset</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="h-9 px-5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-cyan-900/30 border border-cyan-400/40 cursor-pointer active:scale-95"
                  >
                    {isSearching ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-cyan-200" />
                    ) : (
                      <Search className="w-4 h-4 text-cyan-200" />
                    )}
                    <span>{isSearching ? 'Querying PACS...' : 'Query PACS'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Results Table */}
            <div className="flex-1 bg-radiant-darkest border border-radiant-border rounded-lg overflow-hidden flex flex-col">
              <div className="h-8 bg-radiant-card border-b border-radiant-border grid grid-cols-12 px-3 items-center text-[11px] font-bold text-slate-400">
                <div className="col-span-3">Patient Name</div>
                <div className="col-span-2">Patient ID</div>
                <div className="col-span-1">Mod</div>
                <div className="col-span-3">Study Description</div>
                <div className="col-span-1">Date</div>
                <div className="col-span-1">Images</div>
                <div className="col-span-1 text-right">Action</div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-radiant-border">
                {searchResults.length > 0 ? (
                  searchResults.map((res) => {
                    const isDown = downloadingUid === res.studyInstanceUid;
                    return (
                      <div
                        key={res.studyInstanceUid}
                        onDoubleClick={() => handleRetrieve(res)}
                        title="Double-click or click Retrieve to open study in workstation"
                        className="grid grid-cols-12 px-3 py-2 items-center hover:bg-cyan-950/40 cursor-pointer transition-colors text-xs select-none"
                      >
                        <div className="col-span-3 font-semibold text-slate-100 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          <span>{res.patientName}</span>
                        </div>
                        <div className="col-span-2 font-mono text-slate-300">{res.patientId}</div>
                        <div className="col-span-1">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-900/60 text-blue-300 border border-blue-700/50">
                            {res.modalities}
                          </span>
                        </div>
                        <div className="col-span-3 text-amber-300/90 truncate">{res.studyDescription}</div>
                        <div className="col-span-1 text-slate-400 font-mono">{res.studyDate}</div>
                        <div className="col-span-1 font-mono text-cyan-400">{res.numberOfInstances}</div>
                        <div className="col-span-1 flex justify-end">
                          <button
                            onClick={() => handleRetrieve(res)}
                            disabled={isDown}
                            className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white rounded font-semibold text-[11px] flex items-center gap-1 transition-colors shadow-sm"
                          >
                            {isDown ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-cyan-200" />
                            ) : (
                              <Download className="w-3 h-3" />
                            )}
                            <span>Retrieve</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                    <Server className="w-10 h-10 text-slate-700 mb-2" />
                    <p className="text-xs font-semibold">No studies found</p>
                    <p className="text-[11px] text-slate-600 mt-1">
                      {statusMessage.includes('Found 0')
                        ? 'Try selecting a wider date range (e.g. All Dates) or clear the filters'
                        : 'Set search filters and click "Query" to query the PACS server'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Status & Progress Bar */}
            <div className="mt-1 bg-radiant-card border border-radiant-border rounded-lg p-2.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">{statusMessage || 'PACS server ready for queries'}</span>
                {downloadingUid && (
                  <span className="text-cyan-400 font-mono font-bold">{downloadProgress}%</span>
                )}
              </div>
              {downloadingUid && (
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  ></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Servers Configuration & Edit */}
        {activeTab === 'servers' && (
          <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-100 text-sm">Configured PACS Server Nodes:</h3>
                <p className="text-[11px] text-slate-400">Manage DICOM nodes, AE titles, IP addresses, listener ports, and retrieval protocols.</p>
              </div>

              {!isAddingServer && !editingServer && (
                <button
                  onClick={() => {
                    setIsAddingServer(true);
                    setEditingServer(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-semibold text-xs shadow-md transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add PACS Node</span>
                </button>
              )}
            </div>

            {/* Edit Server Form */}
            {editingServer && (
              <div className="bg-radiant-card border-2 border-cyan-500/70 rounded-xl p-4 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-radiant-border pb-2">
                  <div className="flex items-center gap-2">
                    <Edit2 className="w-4 h-4 text-cyan-400" />
                    <h4 className="font-bold text-cyan-300 text-sm">
                      Edit PACS Configuration: <span className="text-white font-mono">{editingServer.name}</span>
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">ID: {editingServer.id}</span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">Friendly Server Name:</label>
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">PACS Called AE Title:</label>
                    <input
                      type="text"
                      value={editForm.aeTitle || ''}
                      onChange={(e) => setEditForm({ ...editForm, aeTitle: e.target.value })}
                      placeholder="e.g. INFOMED"
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-cyan-300 font-mono font-bold focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">Client Calling AE Title:</label>
                    <input
                      type="text"
                      value={editForm.callingAeTitle || ''}
                      onChange={(e) => setEditForm({ ...editForm, callingAeTitle: e.target.value })}
                      placeholder="e.g. RADIANT_VIEWER"
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-amber-300 font-mono font-bold focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">Server Host / IP Address:</label>
                    <input
                      type="text"
                      value={editForm.host || ''}
                      onChange={(e) => setEditForm({ ...editForm, host: e.target.value })}
                      placeholder="e.g. 170.16.0.2"
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 font-mono focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">PACS Server Port:</label>
                    <input
                      type="number"
                      value={editForm.port || 104}
                      onChange={(e) => setEditForm({ ...editForm, port: parseInt(e.target.value, 10) || 104 })}
                      placeholder="e.g. 2025 or 104"
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 font-mono focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">Local C-STORE SCP Port:</label>
                    <input
                      type="number"
                      value={editForm.cStorePort || 11112}
                      onChange={(e) => setEditForm({ ...editForm, cStorePort: parseInt(e.target.value, 10) || 11112 })}
                      placeholder="e.g. 11112 or 104"
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-emerald-400 font-mono focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">Retrieval Protocol Method:</label>
                    <select
                      value={editForm.retrieveMethod || 'c-move'}
                      onChange={(e) => setEditForm({ ...editForm, retrieveMethod: e.target.value as any })}
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="c-move">C-MOVE (Reverse connection to C-STORE SCP)</option>
                      <option value="c-get">C-GET (Direct download on same TCP socket)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">Network Protocol:</label>
                    <select
                      value={editForm.protocol || 'dimse'}
                      onChange={(e) => setEditForm({ ...editForm, protocol: e.target.value as any })}
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="dimse">DICOM DIMSE (Standard TCP Network)</option>
                      <option value="dicomweb">DICOMweb (RESTful HTTP/WADO)</option>
                    </select>
                  </div>

                  {editForm.protocol === 'dicomweb' && (
                    <>
                      <div>
                        <label className="text-[11px] text-slate-300 font-semibold block mb-1">WADO-RS URL:</label>
                        <input
                          type="text"
                          value={editForm.wadoUrl || ''}
                          onChange={(e) => setEditForm({ ...editForm, wadoUrl: e.target.value })}
                          placeholder="http://host:port/wado"
                          className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-300 font-semibold block mb-1">QIDO-RS URL:</label>
                        <input
                          type="text"
                          value={editForm.qidoUrl || ''}
                          onChange={(e) => setEditForm({ ...editForm, qidoUrl: e.target.value })}
                          placeholder="http://host:port/studies"
                          className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 font-mono"
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Edit Form Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-radiant-border/70">
                  <div>
                    <button
                      onClick={() => handleTestEcho({ ...editingServer, ...editForm } as PacsServerConfig)}
                      disabled={isTestingEcho === editingServer.id}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      {isTestingEcho === editingServer.id ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Radio className="w-3.5 h-3.5" />
                      )}
                      <span>Test Connectivity (C-ECHO)</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingServer(null)}
                      className="px-3 py-1.5 bg-radiant-darkest hover:bg-radiant-hover text-slate-300 rounded border border-radiant-border transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEditedServer}
                      className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded flex items-center gap-1.5 shadow-md transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* New Server Form */}
            {isAddingServer && (
              <div className="bg-radiant-card border border-cyan-500/50 rounded-xl p-4 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-radiant-border pb-2">
                  <h4 className="font-bold text-cyan-300 text-sm">Add New PACS Server Node:</h4>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">Friendly Server Name:</label>
                    <input
                      type="text"
                      value={newServer.name || ''}
                      onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                      placeholder="e.g. Main Hospital PACS"
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">PACS Called AE Title:</label>
                    <input
                      type="text"
                      value={newServer.aeTitle || ''}
                      onChange={(e) => setNewServer({ ...newServer, aeTitle: e.target.value })}
                      placeholder="e.g. INFOMED"
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-cyan-300 font-mono font-bold focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">Calling AE Title:</label>
                    <input
                      type="text"
                      value={newServer.callingAeTitle || ''}
                      onChange={(e) => setNewServer({ ...newServer, callingAeTitle: e.target.value })}
                      placeholder="e.g. RADIANT_VIEWER"
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-amber-300 font-mono font-bold focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">Server Host / IP Address:</label>
                    <input
                      type="text"
                      value={newServer.host || ''}
                      onChange={(e) => setNewServer({ ...newServer, host: e.target.value })}
                      placeholder="e.g. 192.168.1.100"
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 font-mono focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">Port:</label>
                    <input
                      type="number"
                      value={newServer.port || 104}
                      onChange={(e) => setNewServer({ ...newServer, port: parseInt(e.target.value, 10) || 104 })}
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 font-mono focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">Local C-STORE SCP Port:</label>
                    <input
                      type="number"
                      value={newServer.cStorePort || 11112}
                      onChange={(e) => setNewServer({ ...newServer, cStorePort: parseInt(e.target.value, 10) || 11112 })}
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-emerald-400 font-mono focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">Retrieval Method:</label>
                    <select
                      value={newServer.retrieveMethod || 'c-move'}
                      onChange={(e) => setNewServer({ ...newServer, retrieveMethod: e.target.value as any })}
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="c-move">C-MOVE</option>
                      <option value="c-get">C-GET</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-300 font-semibold block mb-1">Protocol:</label>
                    <select
                      value={newServer.protocol || 'dimse'}
                      onChange={(e) => setNewServer({ ...newServer, protocol: e.target.value as any })}
                      className="w-full bg-radiant-darkest border border-radiant-border rounded p-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="dimse">DICOM DIMSE (TCP C-FIND/C-MOVE)</option>
                      <option value="dicomweb">DICOMweb (WADO-RS / QIDO-RS)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-radiant-border">
                  <button
                    onClick={() => setIsAddingServer(false)}
                    className="px-3 py-1.5 bg-radiant-panel hover:bg-radiant-hover text-slate-300 rounded border border-radiant-border"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveNewServer}
                    className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded shadow-md"
                  >
                    Save New Server
                  </button>
                </div>
              </div>
            )}

            {/* Configured Servers Cards */}
            <div className="space-y-3">
              {servers.map((s) => {
                const echo = echoResult[s.id];
                const isTesting = isTestingEcho === s.id;
                const isCurrent = editingServer?.id === s.id;

                return (
                  <div
                    key={s.id}
                    className={`bg-radiant-card border rounded-xl p-3.5 flex items-center justify-between transition-all ${
                      isCurrent
                        ? 'border-cyan-400 shadow-md ring-1 ring-cyan-500/40 bg-cyan-950/20'
                        : 'border-radiant-border hover:border-slate-600'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-100 text-sm">{s.name}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-cyan-300 border border-slate-700">
                          {s.protocol.toUpperCase()}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-950 text-blue-300 border border-blue-800">
                          {(s.retrieveMethod || 'c-move').toUpperCase()}
                        </span>
                        {s.id === selectedServerId && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
                        <span>Called AE: <strong className="text-cyan-300 font-bold">{s.aeTitle}</strong></span>
                        <span>•</span>
                        <span>Host: <strong className="text-slate-200">{s.host}:{s.port}</strong></span>
                        <span>•</span>
                        <span>Calling AE: <strong className="text-amber-300">{s.callingAeTitle}</strong></span>
                        <span>•</span>
                        <span>C-STORE: <strong className="text-emerald-400">{s.cStorePort || 11112}</strong></span>
                      </div>

                      {echo && (
                        <div className={`flex items-center gap-1 text-[11px] font-semibold mt-1 ${echo.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {echo.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                          <span>{echo.message}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartEdit(s)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-cyan-500 rounded font-semibold flex items-center gap-1.5 transition-colors"
                        title="Edit PACS Node Settings"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleTestEcho(s)}
                        disabled={isTesting}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded font-semibold flex items-center gap-1.5 transition-colors"
                        title="Test C-ECHO"
                      >
                        {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" /> : <Radio className="w-3.5 h-3.5" />}
                        <span>Echo</span>
                      </button>

                      <button
                        onClick={() => handleDeleteServer(s.id)}
                        className="p-1.5 hover:bg-rose-900/30 text-slate-400 hover:text-rose-400 rounded transition-colors"
                        title="Delete Server"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
