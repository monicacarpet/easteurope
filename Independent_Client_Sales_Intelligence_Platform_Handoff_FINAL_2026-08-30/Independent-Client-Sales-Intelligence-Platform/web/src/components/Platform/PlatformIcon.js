import PropTypes from "prop-types";
import {
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CameraOutlined,
  CaretDownOutlined,
  CaretUpOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  CloudUploadOutlined,
  ControlOutlined,
  DatabaseOutlined,
  DollarOutlined,
  DownloadOutlined,
  EditOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  ExportOutlined,
  FieldTimeOutlined,
  FileAddOutlined,
  FileTextOutlined,
  FilterOutlined,
  GlobalOutlined,
  HistoryOutlined,
  LeftOutlined,
  LineChartOutlined,
  LinkOutlined,
  LockOutlined,
  LoginOutlined,
  MailOutlined,
  MoreOutlined,
  NotificationOutlined,
  RightOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  TableOutlined,
  TeamOutlined,
  UploadOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  UserOutlined,
} from "@ant-design/icons";

const ICONS = {
  account: UserOutlined,
  admin_panel_settings: SafetyCertificateOutlined,
  alternate_email: MailOutlined,
  arrow_drop_down: CaretDownOutlined,
  arrow_drop_up: CaretUpOutlined,
  bar_chart: BarChartOutlined,
  business: BankOutlined,
  calendar: CalendarOutlined,
  campaign: NotificationOutlined,
  check_circle: CheckCircleOutlined,
  chevron_left: LeftOutlined,
  chevron_right: RightOutlined,
  close: CloseOutlined,
  dashboard: AppstoreOutlined,
  database: DatabaseOutlined,
  description: FileTextOutlined,
  download: DownloadOutlined,
  edit: EditOutlined,
  edit_calendar: EditOutlined,
  export: ExportOutlined,
  event: CalendarOutlined,
  event_available: CheckCircleOutlined,
  fact_check: AuditOutlined,
  filter_alt: FilterOutlined,
  history: HistoryOutlined,
  insights: LineChartOutlined,
  inventory_2: DatabaseOutlined,
  lock: LockOutlined,
  login: LoginOutlined,
  map: EnvironmentOutlined,
  mark_email_read: MailOutlined,
  more_horiz: MoreOutlined,
  note_add: FileAddOutlined,
  open_in_new: LinkOutlined,
  outgoing_mail: SendOutlined,
  pending_actions: FieldTimeOutlined,
  person: UserOutlined,
  person_add: UserAddOutlined,
  person_outline: UserOutlined,
  person_remove: UserDeleteOutlined,
  photo_camera: CameraOutlined,
  public: GlobalOutlined,
  request_quote: DollarOutlined,
  rocket_launch: RocketOutlined,
  science: ExperimentOutlined,
  space_dashboard: AppstoreOutlined,
  table_view: TableOutlined,
  team: TeamOutlined,
  tune: ControlOutlined,
  upload: UploadOutlined,
  upload_file: CloudUploadOutlined,
  verified: SafetyCertificateOutlined,
  work: TeamOutlined,
};

export function resolvePlatformIcon(name) {
  return ICONS[name] || AppstoreOutlined;
}

export default function PlatformIcon({
  name,
  size = 18,
  color = "currentColor",
  style = {},
  ...rest
}) {
  const IconComponent = resolvePlatformIcon(name);

  return (
    <IconComponent
      aria-hidden="true"
      style={{ color, fontSize: size, lineHeight: 1, flexShrink: 0, ...style }}
      {...rest}
    />
  );
}

PlatformIcon.propTypes = {
  name: PropTypes.string.isRequired,
  size: PropTypes.number,
  color: PropTypes.string,
  style: PropTypes.objectOf(PropTypes.any),
};
