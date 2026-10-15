"use client";
import { useAccount } from "./AccountContext";
import { useI18n } from "../i18n";
import ActionButton from '../ActionButton';
import Link from 'next/link';
import { permissionLabel } from '@/lib/accounts/labels';
import {OperationalStatus} from '../ui/OperationalFeedback';

export function EffectivePermissionInfo({ permission, policy, recordStatus, blockedReason }) {
  const { user } = useAccount(), { isArabic: ar } = useI18n();
  const scope = user?.permissions?.[permission], profile = user?.profile || {};
  const scopeNames = { ALL: ar?'كل السجلات':'All records', BRANCH:ar?'الفرع':'Branch', BRANCHES:ar?'الفروع المحددة':'Selected branches', TEAM:ar?'الفريق':'Team', OWN:ar?'السجلات الشخصية':'Own records' };
  return <details className="ui-permission-info"><summary>{ar?'الوصول والصلاحيات الفعلية':'Effective access and permissions'} · {scope ? (ar?'صلاحية الإجراء متاحة':'Action permission granted') : (ar?'صلاحية الإجراء غير متاحة':'Action permission not granted')}</summary><dl><div><dt>{ar?'الحساب':'Account'}</dt><dd>{profile.displayName || user?.name}</dd></div><div><dt>{ar?'الدور':'Role'}</dt><dd>{user?.roleName || profile.roleName || user?.role}</dd></div><div><dt>{ar?'نطاق البيانات':'Data scope'}</dt><dd>{scopeNames[profile.dataScope] || profile.dataScope} · {profile.allBranches ? (ar?'جميع الفروع':'All branches') : profile.branches?.join(', ') || '—'}</dd></div><div><dt>{ar?'الإجراء':'Action'}</dt><dd>{permissionLabel(permission, ar)} · {scopeNames[scope] || (ar?'غير مسموح':'Not granted')}</dd></div>{recordStatus&&<div><dt>{ar?'حالة السجل':'Record status'}</dt><dd><OperationalStatus value={recordStatus}/></dd></div>}</dl><p>{blockedReason || (ar?'إتاحة الزر تتطلب صلاحية الإجراء ونطاق السجل وحالة العمل المناسبة. سياسات الاعتماد تضيف شروطها فوق الصلاحيات.':'An action requires its grant, access to the record and an eligible workflow state. Approval policies add their own conditions.')}</p>{policy&&<p>{policy}</p>}<div className="ui-inline-links">{user?.permissions?.['users.view']&&<Link href="/opmanager/settings/access">{ar?'إدارة الحسابات والنطاق':'Manage accounts and scope'}</Link>}{user?.permissions?.['roles.view']&&<Link href="/opmanager/settings/roles">{ar?'الأدوار والصلاحيات':'Roles and permissions'}</Link>}{user?.permissions?.['settings.view']&&<Link href="/opmanager/settings/performance-settings/permissions">{ar?'سياسة اعتماد الأداء':'Performance approval policy'}</Link>}</div></details>;
}
function useAllowed(permission, requireAll = false) {
  const { user } = useAccount();
  const keys = Array.isArray(permission) ? permission : [permission];
  return requireAll
    ? keys.every((key) => Boolean(user?.permissions?.[key]))
    : keys.some((key) => Boolean(user?.permissions?.[key]));
}
export function PermissionButton({
  permission,
  requireAll,
  disabled,
  title,
  ...props
}) {
  const allowed = useAllowed(permission, requireAll);
  const { isArabic } = useI18n();
  return (
    <ActionButton
      {...props}
      disabled={disabled || !allowed}
      title={
        !allowed
          ? isArabic
            ? "ليس لديك صلاحية لهذا الإجراء"
            : "You do not have permission for this action"
          : title
      }
    />
  );
}
export function PermissionFieldset({ permission, disabled, style, ...props }) {
  const allowed = useAllowed(permission);
  return (
    <fieldset
      {...props}
      style={{ minInlineSize: 0, maxInlineSize: "100%", margin: 0, ...style }}
      disabled={disabled || !allowed}
    />
  );
}
export function PermissionSection({
  permission,
  as: Tag = "section",
  ...props
}) {
  const allowed = useAllowed(permission);
  return allowed ? <Tag {...props} /> : null;
}
