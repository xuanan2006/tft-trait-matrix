import {
  ArrowRightLeft,
  ChevronUp,
  CircleAlert,
  DatabaseZap,
  RefreshCw,
  Search,
  ShieldQuestion,
  Sparkles,
  Undo2,
  X
} from 'lucide-react';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';

type TraitCategory = 'origin' | 'class' | 'unknown';
type TraitTier = 'inactive' | 'bronze' | 'silver' | 'unique' | 'gold' | 'prismatic';
type MatrixAxis = 'origin' | 'class';
type HeaderPosition = 'row' | 'column';

type TraitEffect = {
  minUnits: number;
  maxUnits: number;
  style: number;
  label?: string | null;
};

type Trait = {
  id: string;
  apiName: string;
  name: string;
  category: TraitCategory;
  iconUrl?: string;
  description?: string | null;
  effects?: TraitEffect[];
  isUnique?: boolean;
  preview?: boolean;
  fieldSources?: Record<string, string | null>;
};

type Unit = {
  id: string;
  apiName: string;
  name: string;
  cost: number;
  range?: number | null;
  manaStart?: number | null;
  manaMax?: number | null;
  ability?: {
    name?: string | null;
    description?: string | null;
  };
  iconUrl?: string;
  originTraitIds: string[];
  classTraitIds: string[];
  unknownTraitIds: string[];
  allTraitIds: string[];
  traitContributions?: Record<string, number>;
  selectionGroupId?: string;
  variantLabel?: string;
  preview?: boolean;
  fieldSources?: Record<string, string | null>;
};

type TftData = {
  meta: {
    sourceUrl: string;
    fetchedAt: string;
    sourceVersion: string;
    version?: string;
    setId: string;
    setName: string;
    preview?: boolean;
    sourceMode?: string;
    canonicalSource?: string;
    verifiedAt?: string;
    warnings?: string[];
    sources?: Array<{
      id: string;
      label: string;
      role: string;
      url: string;
      status: string;
      error?: string;
    }>;
  };
  traits: Trait[];
  units: Unit[];
};

type SnapshotCatalogEntry = {
  id: string;
  version: string;
  setId: string;
  setName: string;
  preview: boolean;
  path: string;
  updatedAt: string;
};

type SnapshotCatalog = {
  generatedAt: string;
  defaultSnapshotId: string;
  snapshots: SnapshotCatalogEntry[];
};

type TraitStatus = {
  trait: Trait;
  count: number;
  tier: TraitTier;
  nextThreshold?: number;
};

type AxisTrait = Trait & {
  isFallback?: boolean;
};

type MatrixModel = {
  rowAxis: MatrixAxis;
  columnAxis: MatrixAxis;
  rows: AxisTrait[];
  columns: AxisTrait[];
  unitsByCell: Map<string, Unit[]>;
  visibleUnitCount: number;
};

type LinkPath = {
  id: string;
  d: string;
  kind: 'row' | 'column';
  traitId: string;
  tier: TraitTier;
  traitCount: number;
};

type LinkPoint = {
  rowId: string;
  columnId: string;
  unitId: string;
  x: number;
  y: number;
};

type PopoverPosition = {
  top: number;
  left: number;
  placement: 'above' | 'below';
};

type LoadState = 'loading' | 'ready' | 'empty' | 'error';
type MessageTone = 'info' | 'error';

const fallbackTraits: Record<MatrixAxis, AxisTrait> = {
  origin: {
    id: '__other_origin',
    apiName: '__other_origin',
    name: 'Other Origin',
    category: 'origin',
    isFallback: true
  },
  class: {
    id: '__other_class',
    apiName: '__other_class',
    name: 'Other Class',
    category: 'class',
    isFallback: true
  }
};

const formatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

const tierRank: Record<TraitTier, number> = {
  inactive: 0,
  bronze: 1,
  silver: 2,
  unique: 3,
  gold: 4,
  prismatic: 5
};

const floatingPopoverOpenEvent = 'tft-floating-popover-open';
const selectionHistoryLimit = 50;

function App() {
  const [data, setData] = useState<TftData | null>(null);
  const [catalog, setCatalog] = useState<SnapshotCatalog | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [isDatasetLoading, setIsDatasetLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('info');
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());
  const [selectionHistory, setSelectionHistory] = useState<Set<string>[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedTraitFilterIds, setSelectedTraitFilterIds] = useState<string[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [selectedVersion, setSelectedVersion] = useState('pbe');
  const [selectedSetId, setSelectedSetId] = useState('');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [isTransposed, setIsTransposed] = useState(false);
  const [linkPaths, setLinkPaths] = useState<LinkPath[]>([]);
  const [linkSize, setLinkSize] = useState({ width: 0, height: 0 });
  const [showBackToTop, setShowBackToTop] = useState(false);
  const matrixShellRef = useRef<HTMLElement | null>(null);
  const matrixLayerRef = useRef<HTMLDivElement | null>(null);
  const matrixGridRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadPublishedData();
  }, []);

  useEffect(() => {
    const updateBackToTop = () => setShowBackToTop(window.scrollY > 320);
    updateBackToTop();
    window.addEventListener('scroll', updateBackToTop, { passive: true });
    return () => window.removeEventListener('scroll', updateBackToTop);
  }, []);

  const traitsById = useMemo(() => {
    return new Map(data?.traits.map((trait) => [trait.id, trait]) ?? []);
  }, [data]);

  const unitsById = useMemo(() => {
    return new Map(data?.units.map((unit) => [unit.id, unit]) ?? []);
  }, [data]);

  const rosterUnitCount = useMemo(() => {
    return new Set(data?.units.map((unit) => unit.selectionGroupId ?? unit.id) ?? []).size;
  }, [data]);

  const versionOptions = useMemo(() => {
    return Array.from(new Set(catalog?.snapshots.map((snapshot) => snapshot.version) ?? []));
  }, [catalog]);

  const setOptions = useMemo(() => {
    return catalog?.snapshots.filter((snapshot) => snapshot.version === selectedVersion) ?? [];
  }, [catalog, selectedVersion]);

  const selectedUnits = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.units.filter((unit) => selectedUnitIds.has(unit.id));
  }, [data, selectedUnitIds]);

  const selectedTraitCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const unit of selectedUnits) {
      for (const traitId of unit.allTraitIds) {
        counts.set(traitId, (counts.get(traitId) ?? 0) + getTraitContribution(unit, traitId));
      }
    }
    return counts;
  }, [selectedUnits]);

  const traitStatuses = useMemo<TraitStatus[]>(() => {
    const statuses: TraitStatus[] = [];
    for (const [traitId, count] of selectedTraitCounts.entries()) {
      const trait = traitsById.get(traitId);
      if (trait) {
        statuses.push({
          trait,
          count,
          tier: getTraitTier(trait, count),
          nextThreshold: getNextThreshold(trait, count)
        });
      }
    }

    return statuses.sort((a, b) => {
      return (
        tierRank[b.tier] - tierRank[a.tier] ||
        b.count - a.count ||
        a.trait.name.localeCompare(b.trait.name)
      );
    });
  }, [selectedTraitCounts, traitsById]);

  const selectedTraitFilters = useMemo(() => {
    return selectedTraitFilterIds
      .map((traitId) => traitsById.get(traitId))
      .filter((trait): trait is Trait => Boolean(trait));
  }, [selectedTraitFilterIds, traitsById]);

  const traitSuggestions = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const selectedIds = new Set(selectedTraitFilterIds);
    return (data?.traits ?? [])
      .filter((trait) => !selectedIds.has(trait.id))
      .filter((trait) => !query || trait.name.toLowerCase().includes(query))
      .sort((a, b) => {
        const aStarts = query && a.name.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = query && b.name.toLowerCase().startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [data, searchText, selectedTraitFilterIds]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [searchText, selectedTraitFilterIds]);

  const activeTraitCount = traitStatuses.filter((status) => status.tier !== 'inactive').length;

  const matrix = useMemo<MatrixModel>(() => {
    if (!data) {
      return {
        rowAxis: isTransposed ? 'class' : 'origin',
        columnAxis: isTransposed ? 'origin' : 'class',
        rows: [],
        columns: [],
        unitsByCell: new Map<string, Unit[]>(),
        visibleUnitCount: 0
      };
    }

    const rowAxis: MatrixAxis = isTransposed ? 'class' : 'origin';
    const columnAxis: MatrixAxis = isTransposed ? 'origin' : 'class';
    const unitSearch = searchText.trim().toLowerCase();
    const visibleUnits = data.units.filter((unit) => {
      const matchesTraitFilter =
        selectedTraitFilterIds.length === 0 ||
        selectedTraitFilterIds.some((traitId) => unit.allTraitIds.includes(traitId));
      if (!matchesTraitFilter) {
        return false;
      }

      if (!unitSearch) return true;

      const traitText = unit.allTraitIds
        .map((traitId) => traitsById.get(traitId)?.name ?? '')
        .join(' ')
        .toLowerCase();

      return unit.name.toLowerCase().includes(unitSearch) || traitText.includes(unitSearch);
    });

    const usedRowIds = new Set<string>();
    const usedColumnIds = new Set<string>();
    let needsOtherRow = false;
    let needsOtherColumn = false;

    for (const unit of visibleUnits) {
      const rowIds = getPlacementTraitIds(unit, rowAxis, traitsById);
      const columnIds = getPlacementTraitIds(unit, columnAxis, traitsById);
      const finalRowIds = rowIds.length > 0 ? rowIds : [fallbackTraits[rowAxis].id];
      const finalColumnIds = columnIds.length > 0 ? columnIds : [fallbackTraits[columnAxis].id];

      for (const traitId of finalRowIds) {
        if (traitId === fallbackTraits[rowAxis].id) {
          needsOtherRow = true;
        } else {
          usedRowIds.add(traitId);
        }
      }

      for (const traitId of finalColumnIds) {
        if (traitId === fallbackTraits[columnAxis].id) {
          needsOtherColumn = true;
        } else {
          usedColumnIds.add(traitId);
        }
      }
    }

    const rows = toAxisTraits(usedRowIds, traitsById);
    const columns = toAxisTraits(usedColumnIds, traitsById);

    if (needsOtherRow) {
      rows.push(fallbackTraits[rowAxis]);
    }
    if (needsOtherColumn) {
      columns.push(fallbackTraits[columnAxis]);
    }

    const unitsByCell = new Map<string, Unit[]>();
    for (const unit of visibleUnits) {
      const rowIds = getPlacementTraitIds(unit, rowAxis, traitsById);
      const columnIds = getPlacementTraitIds(unit, columnAxis, traitsById);
      const finalRowIds = rowIds.length > 0 ? rowIds : [fallbackTraits[rowAxis].id];
      const finalColumnIds =
        columnIds.length > 0 ? columnIds : [fallbackTraits[columnAxis].id];

      for (const rowId of finalRowIds) {
        for (const columnId of finalColumnIds) {
          const key = cellKey(rowId, columnId);
          const cellUnits = unitsByCell.get(key) ?? [];
          cellUnits.push(unit);
          unitsByCell.set(key, cellUnits);
        }
      }
    }

    for (const cellUnits of unitsByCell.values()) {
      cellUnits.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
    }

    return { rowAxis, columnAxis, rows, columns, unitsByCell, visibleUnitCount: visibleUnits.length };
  }, [data, isTransposed, searchText, selectedTraitFilterIds, traitsById]);

  useLayoutEffect(() => {
    const shell = matrixShellRef.current;
    const layer = matrixLayerRef.current;
    const grid = matrixGridRef.current;

    if (!shell || !layer || !grid) {
      setLinkPaths([]);
      return;
    }

    let frame = 0;
    const refreshLinks = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const selectedButtons = Array.from(
          grid.querySelectorAll<HTMLButtonElement>('.unit-chip.selected[data-row-id][data-column-id]')
        );
        const layerRect = layer.getBoundingClientRect();
        const points = selectedButtons.map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            rowId: button.dataset.rowId ?? '',
            columnId: button.dataset.columnId ?? '',
            unitId: button.dataset.unitId ?? '',
            x: rect.left - layerRect.left + rect.width / 2,
            y: rect.top - layerRect.top + rect.height / 2
          };
        });

        setLinkSize({
          width: grid.scrollWidth,
          height: grid.scrollHeight
        });
        setLinkPaths(buildLinkPaths(points, traitsById, unitsById));
      });
    };

    const observer = new ResizeObserver(refreshLinks);
    observer.observe(grid);
    observer.observe(shell);
    shell.addEventListener('scroll', refreshLinks, { passive: true });
    window.addEventListener('resize', refreshLinks);
    refreshLinks();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      shell.removeEventListener('scroll', refreshLinks);
      window.removeEventListener('resize', refreshLinks);
    };
  }, [matrix, selectedUnitIds, traitsById, unitsById]);

  async function loadPublishedData() {
    setLoadState('loading');
    setMessage('');
    setMessageTone('info');

    try {
      const response = await fetch('/data/catalog.json', { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error('Published data catalog could not be loaded.');
      }

      const publishedCatalog = (await response.json()) as SnapshotCatalog;
      if (!Array.isArray(publishedCatalog.snapshots) || publishedCatalog.snapshots.length === 0) {
        throw new Error('Published data catalog is empty.');
      }

      const defaultSnapshot =
        publishedCatalog.snapshots.find(
          (snapshot) => snapshot.id === publishedCatalog.defaultSnapshotId
        ) ?? publishedCatalog.snapshots[0];
      setCatalog(publishedCatalog);
      await loadPublishedSnapshot(defaultSnapshot, false);
    } catch (catalogError) {
      try {
        const fallbackResponse = await fetch('/data/tft-current.json', { cache: 'no-cache' });
        if (!fallbackResponse.ok) {
          throw catalogError;
        }

        const fallbackData = (await fallbackResponse.json()) as TftData;
        const fallbackVersion = fallbackData.meta.version ?? fallbackData.meta.sourceVersion ?? 'latest';
        const fallbackEntry: SnapshotCatalogEntry = {
          id: 'legacy-current',
          version: fallbackVersion,
          setId: fallbackData.meta.setId,
          setName: fallbackData.meta.setName,
          preview: Boolean(fallbackData.meta.preview),
          path: '/data/tft-current.json',
          updatedAt: fallbackData.meta.fetchedAt
        };
        setCatalog({
          generatedAt: fallbackData.meta.fetchedAt,
          defaultSnapshotId: fallbackEntry.id,
          snapshots: [fallbackEntry]
        });
        setData(fallbackData);
        setSelectedVersion(fallbackEntry.version);
        setSelectedSetId(fallbackEntry.setId);
        setSelectedSnapshotId(fallbackEntry.id);
        resetSelection();
        resetFilters();
        setLoadState('ready');
        setMessageTone('error');
        setMessage('Published catalog unavailable. Showing the fallback dataset.');
      } catch (fallbackError) {
        setData(null);
        setLoadState('error');
        setMessageTone('error');
        setMessage(
          fallbackError instanceof Error
            ? fallbackError.message
            : 'Published TFT data could not be loaded.'
        );
      }
    }
  }

  async function loadPublishedSnapshot(snapshot: SnapshotCatalogEntry, retainCurrent: boolean) {
    setIsDatasetLoading(true);
    setMessage('');
    setMessageTone('info');
    setSelectedVersion(snapshot.version);
    setSelectedSetId(snapshot.setId);

    try {
      const response = await fetch(snapshot.path);
      if (!response.ok) {
        throw new Error(`${snapshot.setName} could not be loaded. Please try again.`);
      }
      const nextData = (await response.json()) as TftData;
      if (!nextData?.meta || !Array.isArray(nextData.units) || !Array.isArray(nextData.traits)) {
        throw new Error(`${snapshot.setName} contains invalid published data.`);
      }

      setData(nextData);
      setSelectedSnapshotId(snapshot.id);
      setLoadState('ready');
      resetSelection();
      resetFilters();
    } catch (error) {
      if (!retainCurrent) {
        throw error;
      }

      const currentSnapshot = catalog?.snapshots.find((entry) => entry.id === selectedSnapshotId);
      if (currentSnapshot) {
        setSelectedVersion(currentSnapshot.version);
        setSelectedSetId(currentSnapshot.setId);
      }
      setMessageTone('error');
      setMessage(
        error instanceof Error
          ? `${error.message} The current dataset is still available.`
          : 'The selected dataset could not be loaded. The current dataset is still available.'
      );
    } finally {
      setIsDatasetLoading(false);
    }
  }

  function changeVersion(version: string) {
    const nextSnapshot = catalog?.snapshots.find((snapshot) => snapshot.version === version);
    if (nextSnapshot) {
      void loadPublishedSnapshot(nextSnapshot, true);
    }
  }

  function changeSet(setId: string) {
    const nextSnapshot = catalog?.snapshots.find(
      (snapshot) => snapshot.version === selectedVersion && snapshot.setId === setId
    );
    if (nextSnapshot) {
      void loadPublishedSnapshot(nextSnapshot, true);
    }
  }

  function resetSelection() {
    setSelectedUnitIds(new Set());
    setSelectionHistory([]);
  }

  function resetFilters() {
    setSearchText('');
    setSelectedTraitFilterIds([]);
    setIsSearchOpen(false);
  }

  function commitSelection(next: Set<string>) {
    if (setsEqual(selectedUnitIds, next)) {
      return;
    }
    setSelectionHistory((history) => [
      ...history.slice(-(selectionHistoryLimit - 1)),
      new Set(selectedUnitIds)
    ]);
    setSelectedUnitIds(next);
  }

  function toggleUnit(unitId: string) {
    const next = new Set(selectedUnitIds);
    if (next.has(unitId)) {
      next.delete(unitId);
    } else {
      const selectionGroupId = unitsById.get(unitId)?.selectionGroupId;
      if (selectionGroupId) {
        for (const selectedId of next) {
          if (unitsById.get(selectedId)?.selectionGroupId === selectionGroupId) {
            next.delete(selectedId);
          }
        }
      }
      next.add(unitId);
    }
    commitSelection(next);
  }

  function clearSelection() {
    commitSelection(new Set());
  }

  function undoSelection() {
    const previous = selectionHistory.at(-1);
    if (!previous) {
      return;
    }
    setSelectedUnitIds(new Set(previous));
    setSelectionHistory((history) => history.slice(0, -1));
  }

  function addTraitFilter(traitId: string) {
    setSelectedTraitFilterIds((current) =>
      current.includes(traitId) ? current : [...current, traitId]
    );
    setSearchText('');
    setIsSearchOpen(true);
    searchInputRef.current?.focus();
  }

  function removeTraitFilter(traitId: string) {
    setSelectedTraitFilterIds((current) => current.filter((id) => id !== traitId));
    setIsSearchOpen(true);
    searchInputRef.current?.focus();
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && traitSuggestions.length > 0) {
      event.preventDefault();
      setIsSearchOpen(true);
      setActiveSuggestionIndex((index) => (index + 1) % traitSuggestions.length);
      return;
    }
    if (event.key === 'ArrowUp' && traitSuggestions.length > 0) {
      event.preventDefault();
      setIsSearchOpen(true);
      setActiveSuggestionIndex((index) => (index - 1 + traitSuggestions.length) % traitSuggestions.length);
      return;
    }
    if (event.key === 'Enter' && isSearchOpen && traitSuggestions.length > 0) {
      event.preventDefault();
      const suggestion = traitSuggestions[Math.min(activeSuggestionIndex, traitSuggestions.length - 1)];
      if (suggestion) {
        addTraitFilter(suggestion.id);
      }
      return;
    }
    if (event.key === 'Escape') {
      setIsSearchOpen(false);
      return;
    }
    if (event.key === 'Backspace' && !searchText && selectedTraitFilterIds.length > 0) {
      removeTraitFilter(selectedTraitFilterIds[selectedTraitFilterIds.length - 1]);
    }
  }

  function scrollToTop() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  const fetchedLabel = data?.meta.fetchedAt ? formatter.format(new Date(data.meta.fetchedAt)) : '';
  const hasMatrix = loadState === 'ready' && data && matrix.rows.length > 0 && matrix.columns.length > 0;
  const hasFilters = searchText.trim().length > 0 || selectedTraitFilterIds.length > 0;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Teamfight Tactics</p>
          <h1>TFT Trait Matrix</h1>
        </div>
        <div className="toolbar">
          <label className="select-control">
            <span>Version</span>
            <select
              value={selectedVersion}
              onChange={(event) => changeVersion(event.target.value)}
              disabled={isDatasetLoading || versionOptions.length === 0}
            >
              {versionOptions.map((version) => (
                <option value={version} key={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>
          <label className="select-control">
            <span>Set</span>
            <select
              value={selectedSetId}
              onChange={(event) => changeSet(event.target.value)}
              disabled={isDatasetLoading || setOptions.length === 0}
            >
              {setOptions.map((setOption) => (
                <option value={setOption.setId} key={setOption.id}>
                  {setOption.setName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section className="status-band" aria-live="polite">
        <div>
          <span className="status-label">Loaded Set</span>
          <strong>{data?.meta.setName ?? 'Not loaded'}</strong>
          {data?.meta.preview && <span className="preview-badge">Preview data</span>}
        </div>
        <div>
          <span className="status-label">Version</span>
          <strong>{data?.meta.version ?? data?.meta.sourceVersion ?? 'latest'}</strong>
        </div>
        <div>
          <span className="status-label">Units</span>
          <strong>{rosterUnitCount}</strong>
        </div>
        <div>
          <span className="status-label">Updated</span>
          <strong>{fetchedLabel || 'Never'}</strong>
        </div>
      </section>

      {data?.meta.preview && (
        <section className="preview-disclosure">
          <div className="preview-warning">
            Set 18 preview data - values may change before and during PBE.
          </div>
          <details className="preview-details">
            <summary>Preview sources and data warnings</summary>
            {data.meta.sources && data.meta.sources.length > 0 && (
              <div className="source-links">
                {data.meta.sources.map((source) => (
                  <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>
                    {source.label}
                  </a>
                ))}
              </div>
            )}
            {data.meta.warnings && data.meta.warnings.length > 0 && (
              <ul>
                {data.meta.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </details>
        </section>
      )}

      {message && (
        <div className={`message ${messageTone === 'error' ? 'error' : ''}`} role="status">
          {messageTone === 'error' ? (
            <CircleAlert size={16} aria-hidden="true" />
          ) : (
            <Sparkles size={16} aria-hidden="true" />
          )}
          <span>{message}</span>
        </div>
      )}

      <section className={`controls-row ${isSearchOpen ? 'search-active' : ''}`}>
        <div
          className="search-combobox"
          onFocusCapture={() => setIsSearchOpen(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsSearchOpen(false);
            }
          }}
        >
          <div className="search-box">
            <Search size={16} aria-hidden="true" />
            {selectedTraitFilters.map((trait) => (
              <TraitFilterToken
                key={trait.id}
                trait={trait}
                count={selectedTraitCounts.get(trait.id) ?? 0}
                onRemove={() => removeTraitFilter(trait.id)}
              />
            ))}
            <span className="visually-hidden" id="trait-search-label">Search units or add trait filters</span>
            <input
              ref={searchInputRef}
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setIsSearchOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              onClick={() => setIsSearchOpen(true)}
              placeholder={selectedTraitFilters.length > 0 ? 'Add trait or search units' : 'Search units or traits'}
              role="combobox"
              aria-labelledby="trait-search-label"
              aria-autocomplete="list"
              aria-expanded={isSearchOpen && traitSuggestions.length > 0}
              aria-controls="trait-search-options"
              aria-activedescendant={
                isSearchOpen && traitSuggestions.length > 0
                  ? `trait-search-option-${Math.min(activeSuggestionIndex, traitSuggestions.length - 1)}`
                  : undefined
              }
            />
            {hasFilters && (
              <button className="search-clear" type="button" onClick={resetFilters} aria-label="Clear search filters" title="Clear search filters">
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          {isSearchOpen && traitSuggestions.length > 0 && (
            <div className="trait-suggestions" id="trait-search-options" role="listbox">
              {traitSuggestions.map((trait, index) => (
                <TraitSuggestionOption
                  key={trait.id}
                  id={`trait-search-option-${index}`}
                  trait={trait}
                  count={selectedTraitCounts.get(trait.id) ?? 0}
                  active={index === activeSuggestionIndex}
                  onHover={() => setActiveSuggestionIndex(index)}
                  onSelect={() => addTraitFilter(trait.id)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="control-actions">
          <button className="icon-button ghost-action" onClick={() => setIsTransposed((value) => !value)}>
            <ArrowRightLeft size={15} aria-hidden="true" />
            <span>Transpose</span>
          </button>
          <button
            className="icon-button ghost-action"
            onClick={undoSelection}
            disabled={selectionHistory.length === 0}
            title="Undo last board selection change"
          >
            <Undo2 size={15} aria-hidden="true" />
            <span>Undo</span>
          </button>
          <button
            className="icon-button ghost-action"
            onClick={clearSelection}
            disabled={selectedUnitIds.size === 0}
          >
            <X size={15} aria-hidden="true" />
            <span>Clear</span>
          </button>
        </div>
      </section>

      {loadState === 'loading' && <EmptyState icon="database" title="Loading TFT data" />}

      {(loadState === 'empty' || loadState === 'error') && (
        <EmptyState
          icon={loadState === 'error' ? 'warning' : 'database'}
          title={loadState === 'error' ? 'Published data unavailable' : 'No TFT data published'}
          action={
            <button className="icon-button primary-action" onClick={loadPublishedData}>
              <RefreshCw size={16} aria-hidden="true" />
              <span>Retry</span>
            </button>
          }
        />
      )}

      {loadState === 'ready' && data && (
        <div className="matrix-workspace">
          <SelectedBoardPanel
            selectedUnitCount={selectedUnitIds.size}
            activeTraitCount={activeTraitCount}
            selectedUnits={selectedUnits}
            traitStatuses={traitStatuses}
            traitsById={traitsById}
            onToggleUnit={toggleUnit}
          />
          <div className="matrix-stage">
            {!hasMatrix && (
              <EmptyState
                icon={hasFilters ? 'search' : 'database'}
                title={hasFilters ? 'No units match these filters' : 'No playable units in this set'}
                action={hasFilters ? (
                  <button className="icon-button ghost-action" onClick={resetFilters}>
                    <X size={15} aria-hidden="true" />
                    <span>Clear filters</span>
                  </button>
                ) : undefined}
              />
            )}

            {hasMatrix && (
        <section
          className="matrix-shell"
          aria-label="TFT origin by class matrix"
          ref={matrixShellRef}
        >
          <div className="matrix-layer" ref={matrixLayerRef}>
            <svg
              className="matrix-link-overlay"
              width={linkSize.width}
              height={linkSize.height}
              viewBox={`0 0 ${linkSize.width} ${linkSize.height}`}
              aria-hidden="true"
            >
              {linkPaths.map((path) => (
                <g
                  className={`matrix-link-group ${path.kind} tier-${path.tier}`}
                  data-trait-id={path.traitId}
                  data-trait-count={path.traitCount}
                  key={path.id}
                >
                  <path className="matrix-link link-halo" d={path.d} />
                  <path className="matrix-link link-core" d={path.d} />
                  <path className="matrix-link link-shimmer" d={path.d} />
                </g>
              ))}
            </svg>
            <div
              className="matrix-grid"
              ref={matrixGridRef}
              style={{
                gridTemplateColumns: `minmax(104px, 118px) repeat(${matrix.columns.length}, 72px)`
              }}
            >
              <div className="corner-cell">
                <span className="corner-column-label">{axisLabel(matrix.columnAxis)}</span>
                <span className="corner-row-label">{axisLabel(matrix.rowAxis)}</span>
              </div>
              {matrix.columns.map((columnTrait) => (
                <TraitHeader
                  key={columnTrait.id}
                  trait={columnTrait}
                  position="column"
                  count={selectedTraitCounts.get(columnTrait.id) ?? 0}
                />
              ))}

              {matrix.rows.map((rowTrait) => (
                <MatrixRow
                  key={rowTrait.id}
                  rowTrait={rowTrait}
                  columns={matrix.columns}
                  unitsByCell={matrix.unitsByCell}
                  selectedUnitIds={selectedUnitIds}
                  selectedTraitCounts={selectedTraitCounts}
                  traitsById={traitsById}
                  onToggleUnit={toggleUnit}
                />
              ))}
            </div>
          </div>
        </section>
            )}
          </div>
        </div>
      )}
      <footer className="public-footer">
        <p>
          TFT Trait Matrix was created under Riot Games&apos; &quot;Legal Jibber Jabber&quot;
          policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this
          project.
        </p>
        <div>
          <a href="https://www.riotgames.com/en/legal" target="_blank" rel="noreferrer">
            Riot fan project policy
          </a>
          <span aria-hidden="true">|</span>
          <span>Free community project</span>
        </div>
      </footer>
      <button
        className={`back-to-top ${showBackToTop ? 'visible' : ''}`}
        type="button"
        onClick={scrollToTop}
        aria-label="Back to top"
        title="Back to top"
        tabIndex={showBackToTop ? 0 : -1}
      >
        <ChevronUp size={22} aria-hidden="true" />
      </button>
    </main>
  );
}

function SelectedBoardPanel({
  selectedUnitCount,
  activeTraitCount,
  selectedUnits,
  traitStatuses,
  traitsById,
  onToggleUnit
}: {
  selectedUnitCount: number;
  activeTraitCount: number;
  selectedUnits: Unit[];
  traitStatuses: TraitStatus[];
  traitsById: Map<string, Trait>;
  onToggleUnit: (unitId: string) => void;
}) {
  return (
    <section className="selected-band" aria-label="Selected board status">
      <div className="selected-header">
        <div>
          <span className="status-label">Selected Units</span>
          <strong data-testid="selected-unit-count">{selectedUnitCount}</strong>
        </div>
        <div>
          <span className="status-label">Active Traits</span>
          <strong>{activeTraitCount}</strong>
        </div>
      </div>
      {selectedUnits.length > 0 ? (
        <div className="selected-content">
          <div className="selected-panel-section">
            <span className="panel-section-label">Board Units</span>
            <div className="selected-units">
              {selectedUnits.map((unit) => (
                <UnitChip
                  key={unit.id}
                  unit={unit}
                  selected
                  traitsById={traitsById}
                  onToggle={onToggleUnit}
                />
              ))}
            </div>
          </div>
          <div className="selected-panel-section">
            <span className="panel-section-label">Trait Status</span>
            <div className="trait-counts">
              {traitStatuses.map((status) => (
                <TraitPill status={status} key={status.trait.id} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-selection">No units selected</div>
      )}
    </section>
  );
}

function MatrixRow({
  rowTrait,
  columns,
  unitsByCell,
  selectedUnitIds,
  selectedTraitCounts,
  traitsById,
  onToggleUnit
}: {
  rowTrait: AxisTrait;
  columns: AxisTrait[];
  unitsByCell: Map<string, Unit[]>;
  selectedUnitIds: Set<string>;
  selectedTraitCounts: Map<string, number>;
  traitsById: Map<string, Trait>;
  onToggleUnit: (unitId: string) => void;
}) {
  return (
    <>
      <TraitHeader trait={rowTrait} position="row" count={selectedTraitCounts.get(rowTrait.id) ?? 0} />
      {columns.map((columnTrait) => {
        const units = unitsByCell.get(cellKey(rowTrait.id, columnTrait.id)) ?? [];
        return (
          <div className="matrix-cell" key={`${rowTrait.id}-${columnTrait.id}`}>
            {units.map((unit) => (
              <UnitChip
                key={unit.id}
                unit={unit}
                selected={selectedUnitIds.has(unit.id)}
                traitsById={traitsById}
                rowId={rowTrait.id}
                columnId={columnTrait.id}
                onToggle={onToggleUnit}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

function useFloatingPopover<T extends HTMLElement>() {
  const anchorRef = useRef<T | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const isOpen = isHovered || isFocused;

  const positionPopover = useCallback(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;

    const viewportMargin = 8;
    const gap = 10;
    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const placement = anchorRect.top - popoverRect.height - gap >= viewportMargin ? 'above' : 'below';
    const preferredTop = placement === 'above'
      ? anchorRect.top - popoverRect.height - gap
      : anchorRect.bottom + gap;
    const top = Math.min(
      Math.max(viewportMargin, preferredTop),
      Math.max(viewportMargin, window.innerHeight - popoverRect.height - viewportMargin)
    );
    const centeredLeft = anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2;
    const left = Math.min(
      Math.max(viewportMargin, centeredLeft),
      Math.max(viewportMargin, window.innerWidth - popoverRect.width - viewportMargin)
    );

    setPosition({ top, left, placement });
  }, []);

  const open = useCallback((source: 'pointer' | 'focus') => {
    window.dispatchEvent(new CustomEvent(floatingPopoverOpenEvent, { detail: tooltipId }));
    if (source === 'pointer') setIsHovered(true);
    else setIsFocused(true);
  }, [tooltipId]);

  useEffect(() => {
    const closeForAnotherPopover = (event: Event) => {
      if (event instanceof CustomEvent && event.detail !== tooltipId) {
        setIsHovered(false);
        setIsFocused(false);
      }
    };
    window.addEventListener(floatingPopoverOpenEvent, closeForAnotherPopover);
    return () => window.removeEventListener(floatingPopoverOpenEvent, closeForAnotherPopover);
  }, [tooltipId]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }

    let frame = 0;
    const schedulePosition = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(positionPopover);
    };
    schedulePosition();
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
    };
  }, [isOpen, positionPopover]);

  return {
    anchorRef,
    popoverRef,
    tooltipId,
    position,
    isOpen,
    openPointer: () => open('pointer'),
    closePointer: () => setIsHovered(false),
    openFocus: () => open('focus'),
    closeFocus: () => setIsFocused(false)
  };
}

function TraitHeader({
  trait,
  position,
  count
}: {
  trait: AxisTrait;
  position: HeaderPosition;
  count: number;
}) {
  const floating = useFloatingPopover<HTMLDivElement>();
  const hasPopover = !trait.isFallback;
  return (
    <>
      <div
        ref={floating.anchorRef}
        className={`trait-header ${position} ${trait.category} ${trait.isFallback ? 'fallback' : ''}`}
        tabIndex={hasPopover ? 0 : undefined}
        onPointerEnter={hasPopover ? floating.openPointer : undefined}
        onPointerLeave={hasPopover ? floating.closePointer : undefined}
        onFocus={hasPopover ? floating.openFocus : undefined}
        onBlur={hasPopover ? floating.closeFocus : undefined}
        aria-describedby={hasPopover && floating.isOpen ? floating.tooltipId : undefined}
      >
        {trait.iconUrl ? (
          <img src={trait.iconUrl} alt="" onError={(event) => event.currentTarget.remove()} />
        ) : (
          <ShieldQuestion size={16} aria-hidden="true" />
        )}
        <span>{trait.name}</span>
      </div>
      {hasPopover && floating.isOpen && (
        <TraitStatusPopover trait={trait} count={count} floating={floating} />
      )}
    </>
  );
}

function TraitFilterToken({
  trait,
  count,
  onRemove
}: {
  trait: Trait;
  count: number;
  onRemove: () => void;
}) {
  const floating = useFloatingPopover<HTMLButtonElement>();
  const visualTier = trait.isUnique ? 'unique' : getTraitTier(trait, count);
  return (
    <>
      <button
        ref={floating.anchorRef}
        className={`trait-filter-token tier-${visualTier}`}
        type="button"
        onClick={onRemove}
        onPointerEnter={floating.openPointer}
        onPointerLeave={floating.closePointer}
        onFocus={floating.openFocus}
        onBlur={floating.closeFocus}
        aria-label={`Remove ${trait.name} filter`}
        aria-describedby={floating.isOpen ? floating.tooltipId : undefined}
      >
        {trait.iconUrl ? <img src={trait.iconUrl} alt="" /> : <ShieldQuestion size={14} aria-hidden="true" />}
        <span>{trait.name}</span>
        <X size={12} aria-hidden="true" />
      </button>
      {floating.isOpen && <TraitStatusPopover trait={trait} count={count} floating={floating} />}
    </>
  );
}

function TraitSuggestionOption({
  id,
  trait,
  count,
  active,
  onHover,
  onSelect
}: {
  id: string;
  trait: Trait;
  count: number;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const floating = useFloatingPopover<HTMLButtonElement>();
  const visualTier = trait.isUnique ? 'unique' : getTraitTier(trait, count);
  return (
    <>
      <button
        ref={floating.anchorRef}
        id={id}
        className={`trait-suggestion tier-${visualTier} ${active ? 'active' : ''}`}
        type="button"
        role="option"
        aria-selected={active}
        onPointerEnter={() => {
          onHover();
          floating.openPointer();
        }}
        onPointerLeave={floating.closePointer}
        onFocus={() => {
          onHover();
          floating.openFocus();
        }}
        onBlur={floating.closeFocus}
        onClick={onSelect}
        aria-describedby={floating.isOpen ? floating.tooltipId : undefined}
      >
        {trait.iconUrl ? <img src={trait.iconUrl} alt="" /> : <ShieldQuestion size={16} aria-hidden="true" />}
        <span>
          <strong>{trait.name}</strong>
          <small>{trait.isUnique ? 'Unique' : formatCategory(trait.category)}</small>
        </span>
        <span className="suggestion-add">Enter</span>
      </button>
      {floating.isOpen && <TraitStatusPopover trait={trait} count={count} floating={floating} />}
    </>
  );
}

function TraitStatusPopover({
  trait,
  count,
  floating
}: {
  trait: Trait;
  count: number;
  floating: {
    popoverRef: React.RefObject<HTMLDivElement | null>;
    tooltipId: string;
    position: PopoverPosition | null;
  };
}) {
  if (typeof document === 'undefined') return null;

  const currentTier = getTraitTier(trait, count);
  const visualTier: TraitTier = trait.isUnique ? 'unique' : currentTier;
  const reachedEffect = getReachedEffect(trait, count);
  const nextThreshold = getNextThreshold(trait, count);
  const effects = [...(trait.effects ?? [])].sort((a, b) => a.minUnits - b.minUnits);
  const style = {
    '--trait-accent': traitTierColor(visualTier),
    top: floating.position?.top ?? 0,
    left: floating.position?.left ?? 0
  } as CSSProperties;

  return createPortal(
    <div
      ref={floating.popoverRef}
      id={floating.tooltipId}
      className={`trait-popover tier-${visualTier} placement-${floating.position?.placement ?? 'above'}`}
      style={style}
      role="tooltip"
      data-ready={floating.position ? 'true' : 'false'}
    >
      <div className="trait-popover-top">
        <span className="trait-popover-icon">
          {trait.iconUrl ? (
            <img src={trait.iconUrl} alt="" onError={(event) => event.currentTarget.remove()} />
          ) : (
            <ShieldQuestion size={22} aria-hidden="true" />
          )}
        </span>
        <span className="trait-popover-heading">
          <strong>{trait.name}</strong>
          <span>{trait.isUnique ? 'Unique trait' : formatCategory(trait.category)}</span>
        </span>
        <span className={`trait-tier-badge tier-${visualTier}`}>
          {formatTraitTier(visualTier)}
        </span>
      </div>
      {trait.description && <p className="trait-description">{trait.description}</p>}
      <div className="trait-current-status">
        <span>Selected contribution</span>
        <strong>{count}</strong>
        {!trait.isUnique && nextThreshold != null && (
          <small>{Math.max(0, nextThreshold - count)} to next tier</small>
        )}
      </div>
      {effects.length > 0 ? (
        <div className="trait-effects" aria-label={`${trait.name} thresholds`}>
          {effects.map((effect) => {
            const effectTier = getEffectTier(effect.style);
            const isCurrent = reachedEffect?.minUnits === effect.minUnits;
            const isNext = !isCurrent && nextThreshold === effect.minUnits;
            return (
              <div
                className={`trait-effect-row tier-${effectTier} ${isCurrent ? 'current' : ''} ${isNext ? 'next' : ''}`}
                key={`${effect.minUnits}-${effect.maxUnits}-${effect.style}`}
              >
                <strong>{formatThreshold(effect)}</strong>
                <span>{effect.label || formatTraitTier(effectTier)}</span>
                {(isCurrent || isNext) && <small>{isCurrent ? 'Current' : 'Next'}</small>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="trait-effect-empty">
          {trait.isUnique ? 'Unique trait' : 'No activation thresholds available'}
        </div>
      )}
    </div>,
    document.body
  );
}

function UnitChip({
  unit,
  selected,
  traitsById,
  rowId,
  columnId,
  onToggle
}: {
  unit: Unit;
  selected: boolean;
  traitsById: Map<string, Trait>;
  rowId?: string;
  columnId?: string;
  onToggle: (unitId: string) => void;
}) {
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const isPopoverOpen = isHovered || isFocused;
  const costColorValue = costColor(unit.cost);
  const neutralCostColorValue = neutralCostColor(unit.cost);
  const mutedCostColor = `color-mix(in srgb, ${costColorValue} 45%, ${neutralCostColorValue} 55%)`;
  const style = {
    '--cost-color': costColorValue,
    '--neutral-cost-color': neutralCostColorValue,
    '--muted-cost-color': mutedCostColor,
    '--neutral-icon-brightness': neutralIconBrightness(unit.cost)
  } as CSSProperties;
  const originTraits = getUnitTraits(unit, traitsById, 'origin');
  const classTraits = getUnitTraits(unit, traitsById, 'class');
  const uniqueTraits = getUnitTraits(unit, traitsById, 'unique');
  const otherTraits = getUnitTraits(unit, traitsById, 'other');
  const manaText = formatMana(unit);
  const abilityName = unit.ability?.name?.trim();
  const abilityDescription = unit.ability?.description?.trim();
  const displayName = getUnitDisplayName(unit);

  const positionPopover = useCallback(() => {
    const chip = chipRef.current;
    const popover = popoverRef.current;
    if (!chip || !popover) {
      return;
    }

    const viewportMargin = 8;
    const gap = 10;
    const chipRect = chip.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const placement = chipRect.top - popoverRect.height - gap >= viewportMargin ? 'above' : 'below';
    const preferredTop =
      placement === 'above'
        ? chipRect.top - popoverRect.height - gap
        : chipRect.bottom + gap;
    const top = Math.min(
      Math.max(viewportMargin, preferredTop),
      Math.max(viewportMargin, window.innerHeight - popoverRect.height - viewportMargin)
    );
    const centeredLeft = chipRect.left + chipRect.width / 2 - popoverRect.width / 2;
    const left = Math.min(
      Math.max(viewportMargin, centeredLeft),
      Math.max(viewportMargin, window.innerWidth - popoverRect.width - viewportMargin)
    );

    setPopoverPosition({ top, left, placement });
  }, []);

  const openPopover = useCallback(
    (source: 'pointer' | 'focus') => {
      window.dispatchEvent(new CustomEvent(floatingPopoverOpenEvent, { detail: tooltipId }));
      if (source === 'pointer') {
        setIsHovered(true);
      } else {
        setIsFocused(true);
      }
    },
    [tooltipId]
  );

  useEffect(() => {
    const closeForAnotherUnit = (event: Event) => {
      if (event instanceof CustomEvent && event.detail !== tooltipId) {
        setIsHovered(false);
        setIsFocused(false);
      }
    };

    window.addEventListener(floatingPopoverOpenEvent, closeForAnotherUnit);
    return () => window.removeEventListener(floatingPopoverOpenEvent, closeForAnotherUnit);
  }, [tooltipId]);

  useLayoutEffect(() => {
    if (!isPopoverOpen) {
      setPopoverPosition(null);
      return;
    }

    let frame = 0;
    const schedulePosition = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(positionPopover);
    };

    schedulePosition();
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
    };
  }, [isPopoverOpen, positionPopover]);

  const popoverStyle = {
    ...style,
    '--unit-accent': selected ? costColorValue : mutedCostColor,
    top: popoverPosition?.top ?? 0,
    left: popoverPosition?.left ?? 0
  } as CSSProperties;

  return (
    <>
      <button
        ref={chipRef}
        className={`unit-chip ${selected ? 'selected' : ''}`}
        style={style}
        onClick={() => onToggle(unit.id)}
        onPointerEnter={() => openPopover('pointer')}
        onPointerLeave={() => setIsHovered(false)}
        onFocus={() => openPopover('focus')}
        onBlur={() => setIsFocused(false)}
        aria-pressed={selected}
        aria-label={`${selected ? 'Deselect' : 'Select'} ${displayName}`}
        aria-describedby={isPopoverOpen ? tooltipId : undefined}
        data-testid="unit-chip"
        data-unit-id={unit.id}
        data-row-id={rowId}
        data-column-id={columnId}
      >
        <span className="unit-portrait" aria-hidden="true">
          {unit.iconUrl ? <img src={unit.iconUrl} alt="" onError={(event) => event.currentTarget.remove()} /> : null}
          <span>{unit.name.slice(0, 1)}</span>
        </span>
        <span className="unit-name">{unit.name}</span>
      </button>
      {isPopoverOpen && typeof document !== 'undefined'
        ? createPortal(
          <div
            ref={popoverRef}
            id={tooltipId}
            className={`unit-popover placement-${popoverPosition?.placement ?? 'above'}`}
            style={popoverStyle}
            role="tooltip"
            data-ready={popoverPosition ? 'true' : 'false'}
          >
            <span className="popover-top">
              <span className="popover-portrait">
                {unit.iconUrl ? (
                  <img src={unit.iconUrl} alt="" onError={(event) => event.currentTarget.remove()} />
                ) : null}
              </span>
              <span>
                <strong>{displayName}</strong>
                <span>
                  Cost {unit.cost} / Range {unit.range ?? '-'}
                  {manaText ? ` / Mana ${manaText}` : ''}
                </span>
              </span>
            </span>
            {(abilityName || abilityDescription) && (
              <span className="popover-ability">
                {abilityName && <strong>{abilityName}</strong>}
                {abilityDescription && <span>{abilityDescription}</span>}
              </span>
            )}
            <PopoverTraitGroup label="Origins" traits={originTraits} unit={unit} />
            <PopoverTraitGroup label="Classes" traits={classTraits} unit={unit} />
            <PopoverTraitGroup label="Unique" traits={uniqueTraits} unit={unit} />
            <PopoverTraitGroup label="Other" traits={otherTraits} unit={unit} />
          </div>,
          document.body
        )
        : null}
    </>
  );
}

function PopoverTraitGroup({
  label,
  traits,
  unit
}: {
  label: string;
  traits: Trait[];
  unit: Unit;
}) {
  if (traits.length === 0) {
    return null;
  }

  return (
    <span className="popover-trait-group">
      <span>{label}</span>
      <strong>
        {traits
          .map((trait) => {
            const contribution = getTraitContribution(unit, trait.id);
            return contribution > 1 ? `${trait.name} x${contribution}` : trait.name;
          })
          .join(' / ')}
      </strong>
    </span>
  );
}

function TraitPill({ status }: { status: TraitStatus }) {
  const floating = useFloatingPopover<HTMLSpanElement>();
  const thresholdText = status.nextThreshold
    ? `${status.count}/${status.nextThreshold}`
    : String(status.count);

  return (
    <>
      <span
        ref={floating.anchorRef}
        className={`trait-pill tier-${status.tier}`}
        tabIndex={0}
        onPointerEnter={floating.openPointer}
        onPointerLeave={floating.closePointer}
        onFocus={floating.openFocus}
        onBlur={floating.closeFocus}
        aria-describedby={floating.isOpen ? floating.tooltipId : undefined}
      >
        {status.trait.iconUrl ? <img src={status.trait.iconUrl} alt="" /> : null}
        <span>{status.trait.name}</span>
        <strong>{thresholdText}</strong>
      </span>
      {floating.isOpen && (
        <TraitStatusPopover trait={status.trait} count={status.count} floating={floating} />
      )}
    </>
  );
}

function EmptyState({
  icon,
  title,
  action
}: {
  icon: 'database' | 'warning' | 'search';
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="empty-state">
      {icon === 'database' ? (
        <DatabaseZap size={34} aria-hidden="true" />
      ) : icon === 'search' ? (
        <Search size={34} aria-hidden="true" />
      ) : (
        <CircleAlert size={34} aria-hidden="true" />
      )}
      <h2>{title}</h2>
      {action}
    </section>
  );
}

function buildLinkPaths(
  points: LinkPoint[],
  traitsById: Map<string, Trait>,
  unitsById: Map<string, Unit>
) {
  const paths: LinkPath[] = [];
  const rowGroups = groupPoints(points, 'rowId');
  const columnGroups = groupPoints(points, 'columnId');

  for (const [rowId, rowPoints] of rowGroups) {
    const trait = traitsById.get(rowId);
    if (!trait) {
      continue;
    }

    const traitCount = getLinkTraitCount(rowPoints, rowId, unitsById);
    const tier = getTraitTier(trait, traitCount);
    const sortedPoints = rowPoints.sort((a, b) => a.x - b.x);
    for (let index = 0; index < sortedPoints.length - 1; index += 1) {
      const start = sortedPoints[index];
      const end = sortedPoints[index + 1];
      const midX = (start.x + end.x) / 2;
      paths.push({
        id: `row-${rowId}-${index}`,
        kind: 'row',
        traitId: rowId,
        tier,
        traitCount,
        d: `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`
      });
    }
  }

  for (const [columnId, columnPoints] of columnGroups) {
    const trait = traitsById.get(columnId);
    if (!trait) {
      continue;
    }

    const traitCount = getLinkTraitCount(columnPoints, columnId, unitsById);
    const tier = getTraitTier(trait, traitCount);
    const sortedPoints = columnPoints.sort((a, b) => a.y - b.y);
    for (let index = 0; index < sortedPoints.length - 1; index += 1) {
      const start = sortedPoints[index];
      const end = sortedPoints[index + 1];
      const midY = (start.y + end.y) / 2;
      paths.push({
        id: `column-${columnId}-${index}`,
        kind: 'column',
        traitId: columnId,
        tier,
        traitCount,
        d: `M ${start.x} ${start.y} C ${start.x} ${midY}, ${end.x} ${midY}, ${end.x} ${end.y}`
      });
    }
  }

  return paths;
}

function getLinkTraitCount(
  points: LinkPoint[],
  traitId: string,
  unitsById: Map<string, Unit>
) {
  return Array.from(new Set(points.map((point) => point.unitId))).reduce((count, unitId) => {
    const unit = unitsById.get(unitId);
    return count + (unit ? getTraitContribution(unit, traitId) : 0);
  }, 0);
}

function groupPoints<T extends 'rowId' | 'columnId'>(
  points: LinkPoint[],
  key: T
) {
  const groups = new Map<string, typeof points>();
  for (const point of points) {
    const groupKey = point[key];
    if (!groupKey) {
      continue;
    }
    const group = groups.get(groupKey) ?? [];
    group.push(point);
    groups.set(groupKey, group);
  }
  return Array.from(groups.entries()).filter(([, group]) => group.length > 1);
}

function getPlacementTraitIds(
  unit: Unit,
  axis: MatrixAxis,
  traitsById: Map<string, Trait>
) {
  const traitIds = axis === 'origin' ? unit.originTraitIds : unit.classTraitIds;
  return traitIds.filter((traitId) => {
    const trait = traitsById.get(traitId);
    return trait && !trait.isUnique;
  });
}

function toAxisTraits(traitIds: Set<string>, traitsById: Map<string, Trait>) {
  return Array.from(traitIds)
    .map((traitId) => traitsById.get(traitId))
    .filter((trait): trait is Trait => Boolean(trait))
    .sort((a, b) => a.name.localeCompare(b.name)) as AxisTrait[];
}

function getUnitTraits(unit: Unit, traitsById: Map<string, Trait>, group: MatrixAxis | 'unique' | 'other') {
  return unit.allTraitIds
    .map((traitId) => traitsById.get(traitId))
    .filter((trait): trait is Trait => {
      if (!trait) {
        return false;
      }
      if (group === 'unique') {
        return Boolean(trait.isUnique);
      }
      if (group === 'other') {
        return trait.category === 'unknown' && !trait.isUnique;
      }
      return trait.category === group && !trait.isUnique;
    });
}

function getTraitContribution(unit: Unit, traitId: string) {
  const contribution = unit.traitContributions?.[traitId] ?? 1;
  return Number.isFinite(contribution) && contribution > 0 ? contribution : 1;
}

function getTraitTier(trait: Trait, count: number): TraitTier {
  if (trait.isUnique && count > 0) {
    return 'unique';
  }
  const effect = getReachedEffect(trait, count);
  if (!effect) {
    return 'inactive';
  }
  return getEffectTier(effect.style);
}

function getEffectTier(style: number): Exclude<TraitTier, 'inactive' | 'unique'> {
  if (style >= 6) return 'prismatic';
  if (style >= 4) return 'gold';
  if (style >= 3) return 'silver';
  return 'bronze';
}

function getReachedEffect(trait: Trait, count: number) {
  return (trait.effects ?? [])
    .filter((effect) => count >= effect.minUnits && count <= effect.maxUnits)
    .sort((a, b) => b.minUnits - a.minUnits)[0];
}

function getNextThreshold(trait: Trait, count: number) {
  return (trait.effects ?? [])
    .filter((effect) => count < effect.minUnits)
    .sort((a, b) => a.minUnits - b.minUnits)[0]?.minUnits;
}

function formatThreshold(effect: TraitEffect) {
  if (effect.maxUnits >= 25000) return `${effect.minUnits}+`;
  if (effect.minUnits === effect.maxUnits) return String(effect.minUnits);
  return `${effect.minUnits}-${effect.maxUnits}`;
}

function formatTraitTier(tier: TraitTier) {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function formatCategory(category: TraitCategory) {
  if (category === 'origin') return 'Origin';
  if (category === 'class') return 'Class';
  return 'Other';
}

function traitTierColor(tier: TraitTier) {
  if (tier === 'bronze') return '#a66a3f';
  if (tier === 'silver') return '#bfc7d2';
  if (tier === 'unique') return '#dc7c2b';
  if (tier === 'gold') return '#f0b43c';
  if (tier === 'prismatic') return '#a9f4ff';
  return '#6f747b';
}

function setsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function formatMana(unit: Unit) {
  if (unit.manaStart == null && unit.manaMax == null) {
    return '';
  }
  if (unit.manaStart == null) {
    return `?/${unit.manaMax}`;
  }
  if (unit.manaMax == null) {
    return `${unit.manaStart}/?`;
  }
  return `${unit.manaStart}/${unit.manaMax}`;
}

function getUnitDisplayName(unit: Unit) {
  return unit.variantLabel ? `${unit.name} (${unit.variantLabel})` : unit.name;
}

function axisLabel(axis: MatrixAxis) {
  return axis === 'origin' ? 'Origin' : 'Class';
}

function cellKey(rowId: string, columnId: string) {
  return `${rowId}::${columnId}`;
}

function costColor(cost: number) {
  if (cost <= 1) {
    return '#9aa1a8';
  }
  if (cost === 2) {
    return '#2ecc71';
  }
  if (cost === 3) {
    return '#3ba3ff';
  }
  if (cost === 4) {
    return '#b65cff';
  }
  return '#f5a524';
}

function neutralCostColor(cost: number) {
  if (cost <= 1) {
    return '#62676d';
  }
  if (cost === 2) {
    return '#7d8389';
  }
  if (cost === 3) {
    return '#989fa6';
  }
  if (cost === 4) {
    return '#b4bac0';
  }
  return '#d2d5d7';
}

function neutralIconBrightness(cost: number) {
  if (cost <= 1) {
    return 0.72;
  }
  if (cost === 2) {
    return 0.78;
  }
  if (cost === 3) {
    return 0.84;
  }
  if (cost === 4) {
    return 0.9;
  }
  return 0.96;
}

export default App;
