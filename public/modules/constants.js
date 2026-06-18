/* ── Constants ─────────────────────────────────────────── */

const DISCIPLINES = ['Arch', 'Stru', 'Mech', 'Elec', 'Civil', 'Plumbing', 'HVAC'];

const DISC_COLORS = {
  Arch: '#e74c3c', Stru: '#3498db', Mech: '#2ecc71',
  Elec: '#f39c12', Civil: '#9b59b6', Plumbing: '#1abc9c', HVAC: '#e67e22'
};

const STANDARD_TASKS = [
  '3D Modelling / Upgradation',
  '2D File Review / Spreadsheet',
  'Revit Sheet Creation & Tagging',
  'AutoCAD Layer Changes',
  'File Control / Consolidation',
  'System Types & View Filters',
  'ACC Model Binding',
  'Coordination Meeting',
  'Site Visit / Survey',
  'RFI Response',
  'Drawing Issue',
  'Quality Check / QA',
  'Material Specification',
  'Shop Drawing Review',
  'Clash Detection',
  'Documentation / Reports',
  'Other'
];

const LEAVE_TYPES = [
  'Annual Leave', 'Sick Leave', 'Emergency Leave',
  'Unpaid Leave', 'Compensatory Off', 'Public Holiday'
];

const ISSUE_TYPES = [
  'Software Crash / Error', 'Network / Internet Issue', 'Power Outage',
  'Hardware Failure', 'Waiting for Input / Files', 'Coordination Delay',
  'Meeting / Interruption', 'Access / Permission Issue', 'Other'
];

const ATT_STATUSES = ['Present', 'Half-day', 'Absent', 'Leave', 'Weekend'];
