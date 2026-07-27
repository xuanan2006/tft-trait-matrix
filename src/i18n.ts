export type Language = 'en' | 'vi';

export type OnboardingStep = {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  note?: string;
  tiers?: Array<{
    label: string;
    className: 'bronze' | 'silver' | 'gold' | 'prismatic';
  }>;
};

const english = {
  version: 'Version',
  set: 'Set',
  guide: 'Guide',
  language: 'Language',
  loadedSet: 'Loaded Set',
  notLoaded: 'Not loaded',
  previewData: 'Preview data',
  units: 'Units',
  updated: 'Updated',
  never: 'Never',
  previewWarning: 'Set 18 preview data - values may change before and during PBE.',
  previewDetails: 'Preview sources and data warnings',
  searchLabel: 'Search units or add trait filters',
  searchWithFilters: 'Add trait or search units',
  searchWithoutFilters: 'Search units or traits',
  clearSearchFilters: 'Clear search filters',
  transpose: 'Transpose',
  undo: 'Undo',
  undoTitle: 'Undo last board selection change',
  clear: 'Clear',
  loadingData: 'Loading TFT data',
  publishedDataUnavailable: 'Published data unavailable',
  noDataPublished: 'No TFT data published',
  retry: 'Retry',
  noUnitsMatch: 'No units match these filters',
  noPlayableUnits: 'No playable units in this set',
  clearFilters: 'Clear filters',
  matrixLabel: 'TFT origin by class matrix',
  riotDisclaimer:
    'TFT Trait Matrix was created under Riot Games\' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.',
  riotPolicy: 'Riot fan project policy',
  freeProject: 'Free community project',
  backToTop: 'Back to top',
  selectedBoardStatus: 'Selected board status',
  selectedUnits: 'Selected Units',
  activeTraits: 'Active Traits',
  boardUnits: 'Board Units',
  traitStatus: 'Trait Status',
  noUnitsSelected: 'No units selected',
  removeFilter: 'Remove {name} filter',
  enter: 'Enter',
  unique: 'Unique',
  uniqueTrait: 'Unique trait',
  selectedContribution: 'Selected contribution',
  toNextTier: '{count} to next tier',
  thresholds: '{name} thresholds',
  current: 'Current',
  next: 'Next',
  noThresholds: 'No activation thresholds available',
  selectUnit: 'Select {name}',
  deselectUnit: 'Deselect {name}',
  costRange: 'Cost {cost} / Range {range}',
  mana: 'Mana',
  origins: 'Origins',
  classes: 'Classes',
  other: 'Other',
  origin: 'Origin',
  class: 'Class',
  otherOrigin: 'Other Origin',
  otherClass: 'Other Class',
  inactive: 'Inactive',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  prismatic: 'Prismatic',
  guideQuick: 'Quick guide',
  closeGuide: 'Close guide',
  guideSteps: 'Guide steps',
  openGuideStep: 'Open {step}: {title}',
  activationTiers: 'Trait activation tiers',
  skip: 'Skip',
  back: 'Back',
  startExploring: 'Start exploring',
  continue: 'Next',
  catalogUnavailable: 'Published catalog unavailable. Showing the fallback dataset.',
  catalogLoadError: 'Published data catalog could not be loaded.',
  catalogEmpty: 'Published data catalog is empty.',
  dataLoadError: 'Published TFT data could not be loaded.',
  snapshotLoadError: '{name} could not be loaded. Please try again.',
  invalidSnapshot: '{name} contains invalid published data.',
  currentDatasetRetained: 'The current dataset is still available.',
  selectedDatasetError:
    'The selected dataset could not be loaded. The current dataset is still available.'
} as const;

export type UiText = Record<keyof typeof english, string>;

const vietnamese: UiText = {
  version: 'Phiên bản',
  set: 'Mùa',
  guide: 'Hướng dẫn',
  language: 'Ngôn ngữ',
  loadedSet: 'Mùa đang dùng',
  notLoaded: 'Chưa tải',
  previewData: 'Dữ liệu xem trước',
  units: 'Tướng',
  updated: 'Cập nhật',
  never: 'Chưa bao giờ',
  previewWarning: 'Dữ liệu Set 18 đang ở bản xem trước và có thể thay đổi trước hoặc trong PBE.',
  previewDetails: 'Nguồn và cảnh báo của dữ liệu xem trước',
  searchLabel: 'Tìm Tướng hoặc thêm bộ lọc Tộc/Hệ',
  searchWithFilters: 'Thêm Tộc/Hệ hoặc tìm Tướng',
  searchWithoutFilters: 'Tìm Tướng hoặc Tộc/Hệ',
  clearSearchFilters: 'Xóa bộ lọc tìm kiếm',
  transpose: 'Đổi trục',
  undo: 'Hoàn tác',
  undoTitle: 'Hoàn tác thay đổi đội hình gần nhất',
  clear: 'Xóa',
  loadingData: 'Đang tải dữ liệu TFT',
  publishedDataUnavailable: 'Không thể tải dữ liệu đã xuất bản',
  noDataPublished: 'Chưa có dữ liệu TFT được xuất bản',
  retry: 'Thử lại',
  noUnitsMatch: 'Không có Tướng phù hợp với bộ lọc',
  noPlayableUnits: 'Không có Tướng có thể chơi trong mùa này',
  clearFilters: 'Xóa bộ lọc',
  matrixLabel: 'Ma trận Tộc và Hệ TFT',
  riotDisclaimer:
    'TFT Trait Matrix được tạo theo chính sách "Legal Jibber Jabber" của Riot Games và sử dụng tài sản thuộc sở hữu của Riot Games. Riot Games không chứng thực hoặc tài trợ dự án này.',
  riotPolicy: 'Chính sách fan project của Riot',
  freeProject: 'Dự án cộng đồng miễn phí',
  backToTop: 'Về đầu trang',
  selectedBoardStatus: 'Trạng thái đội hình đã chọn',
  selectedUnits: 'Tướng đã chọn',
  activeTraits: 'Tộc/Hệ kích hoạt',
  boardUnits: 'Tướng trên bàn',
  traitStatus: 'Trạng thái Tộc/Hệ',
  noUnitsSelected: 'Chưa chọn Tướng',
  removeFilter: 'Xóa bộ lọc {name}',
  enter: 'Enter',
  unique: 'Độc nhất',
  uniqueTrait: 'Tộc/Hệ độc nhất',
  selectedContribution: 'Điểm kích hoạt đã chọn',
  toNextTier: 'Còn {count} để lên mốc tiếp theo',
  thresholds: 'Các mốc của {name}',
  current: 'Hiện tại',
  next: 'Tiếp theo',
  noThresholds: 'Không có dữ liệu mốc kích hoạt',
  selectUnit: 'Chọn {name}',
  deselectUnit: 'Bỏ chọn {name}',
  costRange: 'Giá {cost} / Tầm đánh {range}',
  mana: 'Năng lượng',
  origins: 'Tộc',
  classes: 'Hệ',
  other: 'Khác',
  origin: 'Tộc',
  class: 'Hệ',
  otherOrigin: 'Tộc khác',
  otherClass: 'Hệ khác',
  inactive: 'Chưa kích hoạt',
  bronze: 'Đồng',
  silver: 'Bạc',
  gold: 'Vàng',
  prismatic: 'Kim Cương',
  guideQuick: 'Hướng dẫn nhanh',
  closeGuide: 'Đóng hướng dẫn',
  guideSteps: 'Các bước hướng dẫn',
  openGuideStep: 'Mở {step}: {title}',
  activationTiers: 'Các mốc kích hoạt Tộc/Hệ',
  skip: 'Bỏ qua',
  back: 'Quay lại',
  startExploring: 'Bắt đầu khám phá',
  continue: 'Tiếp theo',
  catalogUnavailable: 'Không thể tải danh mục dữ liệu. Đang hiển thị dữ liệu dự phòng.',
  catalogLoadError: 'Không thể tải danh mục dữ liệu đã xuất bản.',
  catalogEmpty: 'Danh mục dữ liệu đã xuất bản đang trống.',
  dataLoadError: 'Không thể tải dữ liệu TFT đã xuất bản.',
  snapshotLoadError: 'Không thể tải {name}. Vui lòng thử lại.',
  invalidSnapshot: '{name} chứa dữ liệu đã xuất bản không hợp lệ.',
  currentDatasetRetained: 'Dữ liệu hiện tại vẫn có thể sử dụng.',
  selectedDatasetError: 'Không thể tải dữ liệu đã chọn. Dữ liệu hiện tại vẫn có thể sử dụng.'
};

export const uiText: Record<Language, UiText> = {
  en: english,
  vi: vietnamese
};

export const onboardingSteps: Record<Language, OnboardingStep[]> = {
  en: [
    {
      eyebrow: 'Step 1',
      title: 'Choose the right Set and version',
      description: 'Start with the right data before testing trait connections.',
      bullets: [
        'Version selects the data source, such as latest or pbe.',
        'Set selects the TFT season you want to explore.',
        'Changing Set loads new data and clears your previous board.'
      ],
      note: 'Preview data may change before or during PBE.'
    },
    {
      eyebrow: 'Step 2',
      title: 'Read the trait matrix',
      description: 'Each cell is the intersection of one Origin and one Class.',
      bullets: [
        'Origin is the champion faction or background trait.',
        'Class is the champion role trait.',
        'Transpose swaps the axes so you can inspect the matrix from either direction.'
      ]
    },
    {
      eyebrow: 'Step 3',
      title: 'Choose units for your board',
      description: 'Click a unit to add or remove it from your test board.',
      bullets: [
        'Unselected units use grayscale portraits and muted cost borders.',
        'Selected units return to full color with stronger cost borders.',
        'Every appearance of the same unit stays synchronized.',
        'Hover a unit to see cost, range, traits, and ability data when available.'
      ]
    },
    {
      eyebrow: 'Step 4',
      title: 'Follow the shimmering links',
      description: 'Selected units sharing an Origin or Class are connected by light.',
      bullets: [
        'The light grows stronger as the trait reaches higher activation tiers.',
        'This makes traits approaching their next threshold easier to recognize.'
      ],
      tiers: [
        { label: 'Bronze', className: 'bronze' },
        { label: 'Silver', className: 'silver' },
        { label: 'Gold', className: 'gold' },
        { label: 'Prismatic', className: 'prismatic' }
      ]
    },
    {
      eyebrow: 'Step 5',
      title: 'Search multiple traits at once',
      description: 'The search box supports champion names and several trait filters together.',
      bullets: [
        'Type a trait name, then choose a suggestion with the mouse or Enter.',
        'Keep searching to add traits, or use the x on a filter to remove it.',
        'Filters use OR: a unit only needs to belong to one selected trait.',
        'After adding filters, type a champion name to narrow the results.'
      ],
      note: 'This is a free visualization tool, not a tier list or automatic team builder.'
    }
  ],
  vi: [
    {
      eyebrow: 'Bước 1',
      title: 'Chọn đúng Set và phiên bản',
      description: 'Bắt đầu với đúng dữ liệu trước khi thử các kết nối Tộc/Hệ.',
      bullets: [
        'Version chọn nguồn dữ liệu, chẳng hạn latest hoặc pbe.',
        'Set chọn mùa TFT bạn muốn khám phá.',
        'Khi đổi Set, website sẽ tải dữ liệu mới và xóa các lựa chọn trước đó.'
      ],
      note: 'Preview data có thể thay đổi trước hoặc trong giai đoạn PBE.'
    },
    {
      eyebrow: 'Bước 2',
      title: 'Đọc ma trận Tộc/Hệ',
      description: 'Mỗi ô là giao điểm giữa một Tộc và một Hệ.',
      bullets: [
        'Origin tương ứng với Tộc.',
        'Class tương ứng với Hệ.',
        'Transpose đổi vị trí hai trục để bạn quan sát theo hướng thuận tiện hơn.'
      ]
    },
    {
      eyebrow: 'Bước 3',
      title: 'Chọn Tướng cho đội hình',
      description: 'Nhấn vào Tướng để thêm hoặc loại Tướng đó khỏi đội hình thử nghiệm.',
      bullets: [
        'Tướng chưa chọn có portrait đen trắng và viền cost nhẹ.',
        'Tướng đã chọn trở lại đầy đủ màu sắc với viền cost rõ hơn.',
        'Các bản sao của cùng một Tướng ở nhiều ô luôn được đồng bộ.',
        'Di chuột vào Tướng để xem giá, tầm đánh, Tộc/Hệ và kỹ năng khi có dữ liệu.'
      ]
    },
    {
      eyebrow: 'Bước 4',
      title: 'Quan sát liên kết phát sáng',
      description: 'Các Tướng được chọn có chung Tộc/Hệ sẽ tạo thành những đường kết nối.',
      bullets: [
        'Ánh sáng mạnh dần khi trait đạt mốc cao hơn.',
        'Nhờ đó, bạn có thể nhận ra trait sắp đạt mốc tiếp theo nhanh hơn.'
      ],
      tiers: [
        { label: 'Đồng', className: 'bronze' },
        { label: 'Bạc', className: 'silver' },
        { label: 'Vàng', className: 'gold' },
        { label: 'Kim Cương', className: 'prismatic' }
      ]
    },
    {
      eyebrow: 'Bước 5',
      title: 'Tìm nhiều Tộc/Hệ cùng lúc',
      description: 'Search box hỗ trợ tên Tướng và nhiều trait filter trong cùng một lần tìm.',
      bullets: [
        'Nhập tên Tộc/Hệ rồi chọn suggestion bằng chuột hoặc Enter.',
        'Tiếp tục tìm để thêm trait, hoặc nhấn dấu x trên filter để xóa.',
        'Các filter dùng OR: Tướng chỉ cần thuộc ít nhất một trait đã chọn.',
        'Bạn vẫn có thể nhập tên Tướng để thu hẹp kết quả sau khi thêm filter.'
      ],
      note: 'Đây là công cụ visualization miễn phí, không phải tier list hay hệ thống tự động xây dựng đội hình.'
    }
  ]
};

export function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template
  );
}
