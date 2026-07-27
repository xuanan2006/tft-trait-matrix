import {
  ArrowRightLeft,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleHelp,
  DatabaseZap,
  Languages,
  RefreshCw,
  Search,
  ShieldQuestion,
  Sparkles,
  Undo2,
  X
} from 'lucide-react';
import {
  type CSSProperties,
  createContext,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useContext
} from 'react';
import { createPortal } from 'react-dom';
import {
  type Language,
  type UiText,
  interpolate,
  onboardingSteps,
  uiText
} from './i18n';
import {
  getVietnameseAbility,
  getVietnameseTrait,
  getVietnameseTraitEffectLabel
} from './dataTranslations';

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

function resolvePublicUrl(path?: string) {
  if (!path || !path.startsWith('/')) {
    return path;
  }

  return `${import.meta.env.BASE_URL}${path.slice(1)}`;
}

function resolveDataAssetUrls(data: TftData): TftData {
  return {
    ...data,
    traits: data.traits.map((trait) => ({
      ...trait,
      iconUrl: resolvePublicUrl(trait.iconUrl)
    })),
    units: data.units.map((unit) => ({
      ...unit,
      iconUrl: resolvePublicUrl(unit.iconUrl)
    }))
  };
}

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
const onboardingStorageKey = 'tft-trait-matrix:onboarding-v1';
const languageStorageKey = 'tft-trait-matrix:language-v1';
const I18nContext = createContext<{ language: Language; text: UiText }>({
  language: 'en',
  text: uiText.en
});

function useI18n() {
  return useContext(I18nContext);
}

function readStoredLanguage(): Language | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(languageStorageKey);
    return stored === 'en' || stored === 'vi' ? stored : null;
  } catch {
    return null;
  }
}

function hasSeenOnboarding() {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(onboardingStorageKey) === 'seen';
  } catch {
    return false;
  }
}

function App() {
  const [language, setLanguage] = useState<Language>(() => readStoredLanguage() ?? 'en');
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(
    () => readStoredLanguage() === null
  );
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
  const [stickyControlsHeight, setStickyControlsHeight] = useState(0);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => {
    return readStoredLanguage() !== null && !hasSeenOnboarding();
  });
  const [onboardingStep, setOnboardingStep] = useState(0);
  const matrixShellRef = useRef<HTMLElement | null>(null);
  const matrixLayerRef = useRef<HTMLDivElement | null>(null);
  const matrixGridRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const controlsRowRef = useRef<HTMLElement | null>(null);
  const text = uiText[language];
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
    [language]
  );

  useEffect(() => {
    void loadPublishedData();
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const updateBackToTop = () => setShowBackToTop(window.scrollY > 320);
    updateBackToTop();
    window.addEventListener('scroll', updateBackToTop, { passive: true });
    return () => window.removeEventListener('scroll', updateBackToTop);
  }, []);

  useLayoutEffect(() => {
    const controlsRow = controlsRowRef.current;
    if (!controlsRow) {
      return;
    }

    const updateHeight = () => {
      setStickyControlsHeight(Math.ceil(controlsRow.getBoundingClientRect().height));
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(controlsRow);
    return () => observer.disconnect();
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
        getTraitDisplayName(a.trait, language).localeCompare(
          getTraitDisplayName(b.trait, language),
          language
        )
      );
    });
  }, [language, selectedTraitCounts, traitsById]);

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
      .filter((trait) => {
        const localizedName = getTraitDisplayName(trait, language).toLowerCase();
        return !query || trait.name.toLowerCase().includes(query) || localizedName.includes(query);
      })
      .sort((a, b) => {
        const aName = getTraitDisplayName(a, language);
        const bName = getTraitDisplayName(b, language);
        const aStarts = query && aName.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = query && bName.toLowerCase().startsWith(query) ? 0 : 1;
        return aStarts - bStarts || aName.localeCompare(bName, language);
      })
      .slice(0, 8);
  }, [data, language, searchText, selectedTraitFilterIds]);

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
        .map((traitId) => {
          const trait = traitsById.get(traitId);
          return trait
            ? `${trait.name} ${getTraitDisplayName(trait, language)}`
            : '';
        })
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

    const rows = toAxisTraits(usedRowIds, traitsById, language);
    const columns = toAxisTraits(usedColumnIds, traitsById, language);

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
  }, [data, isTransposed, language, searchText, selectedTraitFilterIds, traitsById]);

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
      const response = await fetch(resolvePublicUrl('/data/catalog.json')!, { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(text.catalogLoadError);
      }

      const publishedCatalog = (await response.json()) as SnapshotCatalog;
      if (!Array.isArray(publishedCatalog.snapshots) || publishedCatalog.snapshots.length === 0) {
        throw new Error(text.catalogEmpty);
      }

      const defaultSnapshot =
        publishedCatalog.snapshots.find(
          (snapshot) => snapshot.id === publishedCatalog.defaultSnapshotId
        ) ?? publishedCatalog.snapshots[0];
      setCatalog(publishedCatalog);
      await loadPublishedSnapshot(defaultSnapshot, false);
    } catch (catalogError) {
      try {
        const fallbackResponse = await fetch(resolvePublicUrl('/data/tft-current.json')!, {
          cache: 'no-cache'
        });
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
        setData(resolveDataAssetUrls(fallbackData));
        setSelectedVersion(fallbackEntry.version);
        setSelectedSetId(fallbackEntry.setId);
        setSelectedSnapshotId(fallbackEntry.id);
        resetSelection();
        resetFilters();
        setLoadState('ready');
        setMessageTone('error');
        setMessage(text.catalogUnavailable);
      } catch (fallbackError) {
        setData(null);
        setLoadState('error');
        setMessageTone('error');
        setMessage(
          fallbackError instanceof Error
            ? fallbackError.message
            : text.dataLoadError
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
      const response = await fetch(resolvePublicUrl(snapshot.path)!);
      if (!response.ok) {
        throw new Error(interpolate(text.snapshotLoadError, { name: snapshot.setName }));
      }
      const nextData = (await response.json()) as TftData;
      if (!nextData?.meta || !Array.isArray(nextData.units) || !Array.isArray(nextData.traits)) {
        throw new Error(interpolate(text.invalidSnapshot, { name: snapshot.setName }));
      }

      setData(resolveDataAssetUrls(nextData));
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
          ? `${error.message} ${text.currentDatasetRetained}`
          : text.selectedDatasetError
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

  const openOnboarding = useCallback(() => {
    setOnboardingStep(0);
    setIsOnboardingOpen(true);
  }, []);

  const dismissOnboarding = useCallback(() => {
    try {
      window.localStorage.setItem(onboardingStorageKey, 'seen');
    } catch {
      // The guide can still close when browser storage is unavailable.
    }
    setIsOnboardingOpen(false);
  }, []);

  const changeLanguage = useCallback(
    (nextLanguage: Language) => {
      setLanguage(nextLanguage);
      try {
        window.localStorage.setItem(languageStorageKey, nextLanguage);
      } catch {
        // Language still changes for the current visit when storage is unavailable.
      }

      if (isLanguageModalOpen) {
        setIsLanguageModalOpen(false);
        if (!hasSeenOnboarding()) {
          setOnboardingStep(0);
          setIsOnboardingOpen(true);
        }
      }
    },
    [isLanguageModalOpen]
  );

  const fetchedLabel = data?.meta.fetchedAt ? formatter.format(new Date(data.meta.fetchedAt)) : '';
  const hasMatrix = loadState === 'ready' && data && matrix.rows.length > 0 && matrix.columns.length > 0;
  const hasFilters = searchText.trim().length > 0 || selectedTraitFilterIds.length > 0;

  return (
    <I18nContext.Provider value={{ language, text }}>
      <main
        className="app-shell"
        style={{ '--sticky-controls-height': `${stickyControlsHeight}px` } as CSSProperties}
      >
      <header className="topbar">
        <div>
          <p className="eyebrow">Teamfight Tactics</p>
          <h1>TFT Trait Matrix</h1>
        </div>
        <div className="toolbar">
          <label className="select-control">
            <span>{text.version}</span>
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
            <span>{text.set}</span>
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
          <button
            className="icon-button guide-trigger"
            type="button"
            onClick={openOnboarding}
          >
            <CircleHelp size={16} aria-hidden="true" />
            <span>{text.guide}</span>
          </button>
          <label className="select-control language-control">
            <span>{text.language}</span>
            <span className="language-select-shell">
              <Languages size={15} aria-hidden="true" />
              <select
                value={language}
                onChange={(event) => changeLanguage(event.target.value as Language)}
                aria-label={text.language}
              >
                <option value="en">English</option>
                <option value="vi">Tiếng Việt</option>
              </select>
            </span>
          </label>
        </div>
      </header>

      <section className="status-band" aria-live="polite">
        <div>
          <span className="status-label">{text.loadedSet}</span>
          <strong>{data?.meta.setName ?? text.notLoaded}</strong>
          {data?.meta.preview && <span className="preview-badge">{text.previewData}</span>}
        </div>
        <div>
          <span className="status-label">{text.version}</span>
          <strong>{data?.meta.version ?? data?.meta.sourceVersion ?? 'latest'}</strong>
        </div>
        <div>
          <span className="status-label">{text.units}</span>
          <strong>{rosterUnitCount}</strong>
        </div>
        <div>
          <span className="status-label">{text.updated}</span>
          <strong>{fetchedLabel || text.never}</strong>
        </div>
      </section>

      {data?.meta.preview && (
        <section className="preview-disclosure">
          <div className="preview-warning">
            {text.previewWarning}
          </div>
          <details className="preview-details">
            <summary>{text.previewDetails}</summary>
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

      <section
        className={`controls-row ${isSearchOpen ? 'search-active' : ''}`}
        ref={controlsRowRef}
      >
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
            <span className="visually-hidden" id="trait-search-label">{text.searchLabel}</span>
            <input
              ref={searchInputRef}
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setIsSearchOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              onClick={() => setIsSearchOpen(true)}
              placeholder={
                selectedTraitFilters.length > 0
                  ? text.searchWithFilters
                  : text.searchWithoutFilters
              }
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
              <button
                className="search-clear"
                type="button"
                onClick={resetFilters}
                aria-label={text.clearSearchFilters}
                title={text.clearSearchFilters}
              >
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
            <span>{text.transpose}</span>
          </button>
          <button
            className="icon-button ghost-action"
            onClick={undoSelection}
            disabled={selectionHistory.length === 0}
            title={text.undoTitle}
          >
            <Undo2 size={15} aria-hidden="true" />
            <span>{text.undo}</span>
          </button>
          <button
            className="icon-button ghost-action"
            onClick={clearSelection}
            disabled={selectedUnitIds.size === 0}
          >
            <X size={15} aria-hidden="true" />
            <span>{text.clear}</span>
          </button>
        </div>
      </section>

      {loadState === 'loading' && <EmptyState icon="database" title={text.loadingData} />}

      {(loadState === 'empty' || loadState === 'error') && (
        <EmptyState
          icon={loadState === 'error' ? 'warning' : 'database'}
          title={
            loadState === 'error'
              ? text.publishedDataUnavailable
              : text.noDataPublished
          }
          action={
            <button className="icon-button primary-action" onClick={loadPublishedData}>
              <RefreshCw size={16} aria-hidden="true" />
              <span>{text.retry}</span>
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
                title={hasFilters ? text.noUnitsMatch : text.noPlayableUnits}
                action={hasFilters ? (
                  <button className="icon-button ghost-action" onClick={resetFilters}>
                    <X size={15} aria-hidden="true" />
                    <span>{text.clearFilters}</span>
                  </button>
                ) : undefined}
              />
            )}

            {hasMatrix && (
        <section
          className="matrix-shell"
          aria-label={text.matrixLabel}
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
                <span className="corner-column-label">{axisLabel(matrix.columnAxis, text)}</span>
                <span className="corner-row-label">{axisLabel(matrix.rowAxis, text)}</span>
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
          {text.riotDisclaimer}
        </p>
        <div>
          <a href="https://www.riotgames.com/en/legal" target="_blank" rel="noreferrer">
            {text.riotPolicy}
          </a>
          <span aria-hidden="true">|</span>
          <span>{text.freeProject}</span>
        </div>
      </footer>
      <button
        className={`back-to-top ${showBackToTop ? 'visible' : ''}`}
        type="button"
        onClick={scrollToTop}
        aria-label={text.backToTop}
        title={text.backToTop}
        tabIndex={showBackToTop ? 0 : -1}
      >
        <ChevronUp size={22} aria-hidden="true" />
      </button>
      {isLanguageModalOpen && typeof document !== 'undefined'
        ? createPortal(
            <LanguageModal onSelect={changeLanguage} />,
            document.body
          )
        : null}
      {isOnboardingOpen && typeof document !== 'undefined'
        ? createPortal(
            <OnboardingModal
              step={onboardingStep}
              onStepChange={setOnboardingStep}
              onClose={dismissOnboarding}
            />,
            document.body
          )
        : null}
      </main>
    </I18nContext.Provider>
  );
}

function LanguageModal({ onSelect }: { onSelect: (language: Language) => void }) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstOptionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    firstOptionRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled)')
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="onboarding-backdrop language-backdrop">
      <div
        className="language-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-title"
        aria-describedby="language-description"
      >
        <div className="language-dialog-icon" aria-hidden="true">
          <Languages size={26} />
        </div>
        <p className="language-kicker">TFT Trait Matrix</p>
        <h2 id="language-title">Choose your language</h2>
        <p id="language-description">Chọn ngôn ngữ bạn muốn sử dụng</p>
        <div className="language-options">
          <button
            ref={firstOptionRef}
            type="button"
            onClick={() => onSelect('en')}
          >
            <strong>English</strong>
            <span>Continue in English</span>
          </button>
          <button type="button" onClick={() => onSelect('vi')}>
            <strong>Tiếng Việt</strong>
            <span>Tiếp tục bằng Tiếng Việt</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingModal({
  step,
  onStepChange,
  onClose
}: {
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
}) {
  const { language, text } = useI18n();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const steps = onboardingSteps[language];
  const currentStep = steps[step];
  const isFirstStep = step === 0;
  const isLastStep = step === steps.length - 1;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="onboarding-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="onboarding-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <header className="onboarding-header">
          <div className="onboarding-brand">
            <CircleHelp size={20} aria-hidden="true" />
            <div>
              <span>{text.guideQuick}</span>
              <strong>TFT Trait Matrix</strong>
            </div>
          </div>
          <button
            className="onboarding-close"
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={text.closeGuide}
            title={text.closeGuide}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <nav className="onboarding-progress" aria-label={text.guideSteps}>
          {steps.map((guideStep, index) => (
            <button
              className={`${index === step ? 'active' : ''} ${index < step ? 'completed' : ''}`}
              type="button"
              onClick={() => onStepChange(index)}
              aria-label={interpolate(text.openGuideStep, {
                step: guideStep.eyebrow,
                title: guideStep.title
              })}
              aria-current={index === step ? 'step' : undefined}
              key={guideStep.title}
            >
              <span>{index + 1}</span>
            </button>
          ))}
        </nav>

        <section className="onboarding-content">
          <p className="onboarding-eyebrow">{currentStep.eyebrow}</p>
          <h2 id="onboarding-title">{currentStep.title}</h2>
          <p className="onboarding-description">{currentStep.description}</p>
          <ul className="onboarding-list">
            {currentStep.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          {'tiers' in currentStep && currentStep.tiers ? (
            <div className="onboarding-tiers" aria-label={text.activationTiers}>
              {currentStep.tiers.map((tier) => (
                <span className={`tier-${tier.className}`} key={tier.label}>
                  {tier.label}
                </span>
              ))}
            </div>
          ) : null}
          {'note' in currentStep && currentStep.note ? (
            <p className="onboarding-note">{currentStep.note}</p>
          ) : null}
        </section>

        <footer className="onboarding-footer">
          <button className="onboarding-skip" type="button" onClick={onClose}>
            {text.skip}
          </button>
          <div>
            {!isFirstStep && (
              <button
                className="icon-button ghost-action"
                type="button"
                onClick={() => onStepChange(step - 1)}
              >
                <ChevronLeft size={16} aria-hidden="true" />
                <span>{text.back}</span>
              </button>
            )}
            <button
              className="icon-button primary-action"
              type="button"
              onClick={() => {
                if (isLastStep) {
                  onClose();
                } else {
                  onStepChange(step + 1);
                }
              }}
            >
              <span>{isLastStep ? text.startExploring : text.continue}</span>
              {isLastStep ? (
                <Sparkles size={16} aria-hidden="true" />
              ) : (
                <ChevronRight size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
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
  const { text } = useI18n();
  return (
    <section className="selected-band" aria-label={text.selectedBoardStatus}>
      <div className="selected-header">
        <div>
          <span className="status-label">{text.selectedUnits}</span>
          <strong data-testid="selected-unit-count">{selectedUnitCount}</strong>
        </div>
        <div>
          <span className="status-label">{text.activeTraits}</span>
          <strong>{activeTraitCount}</strong>
        </div>
      </div>
      {selectedUnits.length > 0 ? (
        <div className="selected-content">
          <div className="selected-panel-section">
            <span className="panel-section-label">{text.boardUnits}</span>
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
            <span className="panel-section-label">{text.traitStatus}</span>
            <div className="trait-counts">
              {traitStatuses.map((status) => (
                <TraitPill status={status} key={status.trait.id} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-selection">{text.noUnitsSelected}</div>
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
  const { language, text } = useI18n();
  const floating = useFloatingPopover<HTMLDivElement>();
  const hasPopover = !trait.isFallback;
  const displayName = trait.isFallback
    ? trait.category === 'origin'
      ? text.otherOrigin
      : text.otherClass
    : getTraitDisplayName(trait, language);
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
        <span>{displayName}</span>
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
  const { language, text } = useI18n();
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
        aria-label={interpolate(text.removeFilter, {
          name: getTraitDisplayName(trait, language)
        })}
        aria-describedby={floating.isOpen ? floating.tooltipId : undefined}
      >
        {trait.iconUrl ? <img src={trait.iconUrl} alt="" /> : <ShieldQuestion size={14} aria-hidden="true" />}
        <span>{getTraitDisplayName(trait, language)}</span>
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
  const { language, text } = useI18n();
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
          <strong>{getTraitDisplayName(trait, language)}</strong>
          <small>{trait.isUnique ? text.unique : formatCategory(trait.category, text)}</small>
        </span>
        <span className="suggestion-add">{text.enter}</span>
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
  const { language, text } = useI18n();
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
          <strong>{getTraitDisplayName(trait, language)}</strong>
          <span>{trait.isUnique ? text.uniqueTrait : formatCategory(trait.category, text)}</span>
        </span>
        <span className={`trait-tier-badge tier-${visualTier}`}>
          {formatTraitTier(visualTier, text)}
        </span>
      </div>
      {getTraitDisplayDescription(trait, language) && (
        <p className="trait-description">{getTraitDisplayDescription(trait, language)}</p>
      )}
      <div className="trait-current-status">
        <span>{text.selectedContribution}</span>
        <strong>{count}</strong>
        {!trait.isUnique && nextThreshold != null && (
          <small>
            {interpolate(text.toNextTier, {
              count: Math.max(0, nextThreshold - count)
            })}
          </small>
        )}
      </div>
      {effects.length > 0 ? (
        <div
          className="trait-effects"
          aria-label={interpolate(text.thresholds, {
            name: getTraitDisplayName(trait, language)
          })}
        >
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
                <span>
                  {(language === 'vi'
                    ? getVietnameseTraitEffectLabel(effect.label)
                    : effect.label) || formatTraitTier(effectTier, text)}
                </span>
                {(isCurrent || isNext) && (
                  <small>{isCurrent ? text.current : text.next}</small>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="trait-effect-empty">
          {trait.isUnique ? text.uniqueTrait : text.noThresholds}
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
  const { language, text } = useI18n();
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
  const abilityTranslation =
    language === 'vi' ? getVietnameseAbility(unit.ability?.name?.trim()) : undefined;
  const abilityName = abilityTranslation?.name ?? unit.ability?.name?.trim();
  const abilityDescription =
    abilityTranslation?.description ?? unit.ability?.description?.trim();
  const displayName = getUnitDisplayName(unit, language);

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
        aria-label={interpolate(selected ? text.deselectUnit : text.selectUnit, {
          name: displayName
        })}
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
                  {interpolate(text.costRange, {
                    cost: unit.cost,
                    range: unit.range ?? '-'
                  })}
                  {manaText ? ` / ${text.mana} ${manaText}` : ''}
                </span>
              </span>
            </span>
            {(abilityName || abilityDescription) && (
              <span className="popover-ability">
                {abilityName && <strong>{abilityName}</strong>}
                {abilityDescription && <span>{abilityDescription}</span>}
              </span>
            )}
            <PopoverTraitGroup label={text.origins} traits={originTraits} unit={unit} />
            <PopoverTraitGroup label={text.classes} traits={classTraits} unit={unit} />
            <PopoverTraitGroup label={text.unique} traits={uniqueTraits} unit={unit} />
            <PopoverTraitGroup label={text.other} traits={otherTraits} unit={unit} />
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
  const { language } = useI18n();
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
            const name = getTraitDisplayName(trait, language);
            return contribution > 1 ? `${name} x${contribution}` : name;
          })
          .join(' / ')}
      </strong>
    </span>
  );
}

function TraitPill({ status }: { status: TraitStatus }) {
  const { language } = useI18n();
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
        <span>{getTraitDisplayName(status.trait, language)}</span>
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

function toAxisTraits(
  traitIds: Set<string>,
  traitsById: Map<string, Trait>,
  language: Language
) {
  return Array.from(traitIds)
    .map((traitId) => traitsById.get(traitId))
    .filter((trait): trait is Trait => Boolean(trait))
    .sort((a, b) =>
      getTraitDisplayName(a, language).localeCompare(
        getTraitDisplayName(b, language),
        language
      )
    ) as AxisTrait[];
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

function formatTraitTier(tier: TraitTier, text: UiText) {
  return text[tier];
}

function formatCategory(category: TraitCategory, text: UiText) {
  if (category === 'origin') return text.origin;
  if (category === 'class') return text.class;
  return text.other;
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

function getTraitDisplayName(trait: Trait, language: Language) {
  if (language === 'vi') {
    return getVietnameseTrait(trait.name)?.name ?? trait.name;
  }
  return trait.name;
}

function getTraitDisplayDescription(trait: Trait, language: Language) {
  if (language === 'vi') {
    return getVietnameseTrait(trait.name)?.description ?? trait.description;
  }
  return trait.description;
}

function getUnitDisplayName(unit: Unit, language: Language) {
  if (!unit.variantLabel) {
    return unit.name;
  }
  const localizedVariant =
    language === 'vi'
      ? getVietnameseTrait(unit.variantLabel)?.name ?? unit.variantLabel
      : unit.variantLabel;
  return `${unit.name} (${localizedVariant})`;
}

function axisLabel(axis: MatrixAxis, text: UiText) {
  return axis === 'origin' ? text.origin : text.class;
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
