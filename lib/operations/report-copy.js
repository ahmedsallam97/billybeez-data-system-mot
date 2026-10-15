const { workspaceLabel } = require('./succession-workspace');
const labels = {
  SUBMITTED: ['Submitted', 'مرسل للمراجعة'], CANCELLED: ['Cancelled', 'ملغي'], CREATED: ['Created', 'تم الإنشاء'],
  saveDraft: ['Draft saved', 'تم حفظ المسودة'], submit: ['Submitted', 'تم الإرسال'], review: ['Reviewed', 'تمت المراجعة'], approve: ['Approved', 'تم الاعتماد'], cancel: ['Cancelled and reversed', 'تم الإلغاء وعكس الأثر'], reject: ['Rejected', 'تم الرفض'], reopen: ['Reopened', 'أعيد فتحه'], lock: ['Locked', 'تم القفل'], upgradeDraftTemplate: ['Template upgraded', 'تم تحديث القالب'],
};
const errors = {
  BIRTHDAY_RESPONSIBLE_LIMIT: ['A birthday report allows at most two responsible employees.', 'تقرير عيد الميلاد يسمح بموظف مسؤول أو اثنين كحد أقصى.'],
  ADJUSTMENT_PARTICIPANT_REQUIRED: ['Event points must belong to an actual report participant.', 'يجب ربط نقاط الحدث بموظف شارك فعليًا في التقرير.'],
  REPORT_CONFLICT: ['Another session updated this report. Keep your input, reload the report and retry.', 'جلسة أخرى عدلت التقرير. احتفظ بمدخلاتك، ثم حدّث التقرير وأعد المحاولة.'],
  REPORT_SOURCE_NOT_FOUND: ['The source booking or day is missing or cancelled. Check its source page before submitting or approving.', 'الحجز أو يوم التشغيل غير موجود أو ملغي. راجع صفحة المصدر قبل الإرسال أو الاعتماد.'],
  REPORT_NOT_REVIEWABLE: ['Submit the report before recording its review.', 'أرسل التقرير أولًا قبل تسجيل المراجعة.'],
  INDEPENDENT_REPORT_REVIEW_REQUIRED: ['A different authorized manager must review and approve this report.', 'يلزم مدير آخر لديه الصلاحية لمراجعة واعتماد هذا التقرير.'],
  REPORT_UNRESOLVED_ISSUES: ['Resolve all recorded issues before approval.', 'أكمل حل المشكلات المسجلة قبل الاعتماد.'],
  PROCESS_TEMPLATE_AMBIGUOUS: ['Choose a process template from the available templates for this booking before creating the report.', 'اختر قالب عملية من القوالب المتاحة لهذا الحجز قبل إنشاء التقرير.'],
  SURVEY_TEMPLATE_AMBIGUOUS: ['Choose a survey template from the available templates for this booking before creating the report.', 'اختر قالب استبيان من القوالب المتاحة لهذا الحجز قبل إنشاء التقرير.'],
  PROCESS_TEMPLATE_REQUIRED: ['Publish an active process template covering this report type, branch and booking date in Report settings.', 'انشر قالب عملية نشطًا يغطي نوع التقرير والفرع وتاريخ الحجز من إعدادات التقارير.'],
  SURVEY_TEMPLATE_REQUIRED: ['This report requires an active survey template covering its branch and booking date. Configure it in Survey settings.', 'هذا التقرير يحتاج قالب استبيان نشطًا يغطي الفرع وتاريخ الحجز. اضبطه من إعدادات الاستبيانات.'],
  PROCESS_TEMPLATE_BRANCH_EMPTY: ['The process template has no active step for this branch. Update its configured steps before creating the report.', 'قالب العملية لا يحتوي خطوات نشطة لهذا الفرع. حدّث خطواته المحددة قبل إنشاء التقرير.'],
  REPORT_NOT_ACTIVE: ['Reporting for this type is disabled in this booking branch. Check the configured report scope.', 'هذا النوع من التقارير غير مفعّل في فرع الحجز. راجع نطاق التقرير المحدد في الإعدادات.'],
};
function reportLabel(code, ar) { return labels[code]?.[ar ? 1 : 0] || workspaceLabel(code, ar); }
function reportError(error, ar) { return errors[error?.code]?.[ar ? 1 : 0] || error?.message || String(error || ''); }
module.exports = { reportLabel, reportError };
