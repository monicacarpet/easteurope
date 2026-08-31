import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import additionalTranslations from "i18n/additionalTranslations";

export const LANGUAGE_KEY = "platform-ui-language";

const SAFE_TEXT_REPLACEMENTS = [
  [
    "Application roles are separate from Supabase authentication and are enforced by Row-Level Security.",
    "Manage user access and assigned roles.",
  ],
  [
    "Permissions are enforced by Supabase Row-Level Security, not only hidden in the interface.",
    "Access is based on your assigned role.",
  ],
  [
    "Create authentication users in Supabase, then assign their Platform application role here.",
    "Manage Platform users and access levels.",
  ],
  [
    "No application activity has been recorded yet. Run the activity-log SQL patch once; new notes, follow-ups, claims, campaign-control changes and sent emails will then appear automatically.",
    "No activity records available.",
  ],
  ["No application activity has been recorded yet.", "No activity records available."],
];

const TRANSLATIONS = [
  ["Platform Intelligence", "Platform 智能平台"],
  ["Sales & stock intelligence", "销售与库存智能"],
  ["Sales & Stock Intelligence", "销售与库存智能"],
  ["Sales, stock and campaign intelligence", "销售、库存与推广智能"],
  ["Internal Sales Intelligence", "内部销售智能"],
  ["Authorized internal users only", "仅限授权内部用户"],

  ["Dashboard", "仪表盘"],
  ["SALES WORKSPACE", "销售工作台"],
  ["Sales Workspace", "销售工作台"],
  ["Lead Database", "客户线索库"],
  ["My Leads", "我的线索"],
  ["Follow-ups", "跟进事项"],

  ["INVENTORY INTELLIGENCE", "库存智能"],
  ["Inventory Intelligence", "库存智能"],
  ["Stock Portfolio", "库存概览"],
  ["Promotion Campaigns", "推广活动"],

  ["ANALYSIS & CONTROL", "分析与控制"],
  ["Analysis & Control", "分析与控制"],
  ["GIS", "地图"],
  ["Data Quality", "数据质量"],
  ["Reports", "报告"],
  ["Claim Overview", "认领概览"],
  ["Activity", "活动记录"],
  ["Administration", "用户管理"],
  ["Account", "账户"],

  ["Search", "搜索"],
  ["Search pages", "搜索页面"],
  ["Sign in", "登录"],
  ["Sign out", "退出登录"],
  ["Work email", "工作邮箱"],
  ["Password", "密码"],
  ["Loading...", "加载中..."],
  ["Loading…", "加载中…"],

  ["Total leads", "线索总数"],
  ["Usable email", "有效邮箱"],
  ["Decision contacts", "决策联系人"],
  ["High-priority leads", "高优先级线索"],
  ["GIS coverage", "地图覆盖率"],
  ["Lead-campaign reach", "客户开发触达"],
  ["Data quality at a glance", "数据质量概览"],
  ["Ready leads", "就绪线索"],
  ["Portfolio", "线索总库"],
  ["Company email coverage", "公司邮箱覆盖率"],
  ["Verified email coverage", "已验证邮箱覆盖率"],
  ["Decision-contact coverage", "决策联系人覆盖率"],

  ["Stock intelligence", "库存智能"],
  ["MONTHLY MOVEMENT", "月度变化"],
  ["TOTAL STOCK", "库存总量"],
  ["STOCK ABOVE 20 M²", "20 m² 以上库存"],
  ["Stock comparison", "库存对比"],
  ["Total stock", "库存总量"],
  ["Leads reached", "触达线索"],
  ["Countries", "国家"],
  ["Emails", "邮件"],
  ["this month", "本月"],
  ["reached", "已触达"],
  ["stock outreach", "库存推广"],
  ["ready now", "当前就绪"],
  ["models", "个型号"],

  ["Available Leads", "可认领线索"],
  ["Available leads", "可认领线索"],
  ["Claimed Leads", "已认领线索"],
  ["Claimed leads", "已认领线索"],
  ["Claim Lead", "认领线索"],
  ["Claim lead", "认领线索"],
  ["Claim", "认领"],
  ["Release", "释放"],
  ["Released", "已释放"],
  ["Claimed", "已认领"],
  ["Lead ID", "线索 ID"],
  ["Company", "公司"],
  ["Country", "国家"],
  ["City", "城市"],
  ["State", "州/省"],
  ["Address", "地址"],
  ["Phone", "电话"],
  ["Website", "网站"],
  ["Email", "邮箱"],
  ["Contact Name", "联系人姓名"],
  ["Contact name", "联系人姓名"],
  ["Contact", "联系人"],
  ["Job Title", "职位"],
  ["Job title", "职位"],
  ["Status", "状态"],
  ["Market", "市场"],
  ["Source", "来源"],
  ["Score", "评分"],
  ["Priority", "优先级"],
  ["Assigned To", "负责人"],
  ["Assigned to", "负责人"],
  ["Assigned At", "认领时间"],
  ["Assigned at", "认领时间"],
  ["Actions", "操作"],
  ["View", "查看"],
  ["Edit", "编辑"],
  ["Save", "保存"],
  ["Cancel", "取消"],
  ["Close", "关闭"],
  ["Apply", "应用"],
  ["Reset", "重置"],
  ["Filter", "筛选"],
  ["Filters", "筛选条件"],
  ["Clear filters", "清除筛选"],
  ["Export", "导出"],
  ["Download", "下载"],
  ["Refresh", "刷新"],
  ["All Countries", "所有国家"],
  ["All countries", "所有国家"],
  ["Available", "可认领"],
  ["Unassigned", "未分配"],

  ["Add Note", "添加备注"],
  ["Add note", "添加备注"],
  ["Your Notes", "我的备注"],
  ["Your notes", "我的备注"],
  ["Notes", "备注"],
  ["Note", "备注"],
  ["Add Follow-up", "添加跟进"],
  ["Add follow-up", "添加跟进"],
  ["Create Follow-up", "创建跟进"],
  ["Create follow-up", "创建跟进"],
  ["Follow-up Date", "跟进日期"],
  ["Follow-up date", "跟进日期"],
  ["Follow-up", "跟进"],
  ["Due Date", "到期日期"],
  ["Due date", "到期日期"],
  ["Completed", "已完成"],
  ["Pending", "待处理"],
  ["Complete", "完成"],
  ["Title", "标题"],
  ["Description", "描述"],

  ["Lead ownership", "线索认领情况"],
  ["Current workload and lead claim history", "当前工作量与线索认领记录"],
  ["Current claimed leads by team member", "团队成员当前认领线索"],
  ["Claim history", "认领记录"],
  ["Team Member", "团队成员"],
  ["Team member", "团队成员"],
  ["Role", "角色"],
  ["Current Leads", "当前线索数"],
  ["Current leads", "当前线索数"],
  ["Last Claimed", "最近认领时间"],
  ["Last claimed", "最近认领时间"],
  ["Time", "时间"],
  ["Action", "操作"],

  ["Campaign Control", "活动控制"],
  ["Campaign control", "活动控制"],
  ["Lead Outreach", "客户开发"],
  ["Lead outreach", "客户开发"],
  ["Stock Promotion", "库存推广"],
  ["Stock promotion", "库存推广"],
  ["ACTIVE", "运行中"],
  ["INACTIVE", "已停用"],
  ["Agent Enabled", "启用自动发送"],
  ["Agent enabled", "启用自动发送"],
  ["Target Countries", "目标国家"],
  ["Target countries", "目标国家"],
  ["Start Date", "开始日期"],
  ["Start date", "开始日期"],
  ["End Date", "结束日期"],
  ["End date", "结束日期"],
  ["Save Controls", "保存设置"],
  ["Save controls", "保存设置"],
  ["Sent This Month", "本月已发送"],
  ["Sent this month", "本月已发送"],
  ["Unique Leads Reached", "触达线索数"],
  ["Unique leads reached", "触达线索数"],
  ["Countries Reached", "触达国家数"],
  ["Countries reached", "触达国家数"],
  ["Failed", "失败"],
  ["Last Send", "最近发送"],
  ["Last send", "最近发送"],
  ["Sender", "发件账号"],
  ["Manual stock promotion", "手动库存推广"],
  ["Select lead manually", "手动选择线索"],
  ["Search company, contact or email", "搜索公司、联系人或邮箱"],
  ["Send with agent", "由智能代理发送"],
  ["Send without waiting for local-time window", "无需等待客户当地发送时段"],
  ["Working…", "处理中…"],
  ["Cancel", "取消"],
  ["No named contact", "无实名联系人"],
  ["No email", "无邮箱"],

  ["Current Stock", "当前库存"],
  ["Current stock", "当前库存"],
  ["Current Inventory", "当前库存"],
  ["Current inventory", "当前库存"],
  ["Product Type", "产品类型"],
  ["Product type", "产品类型"],
  ["Product", "产品"],
  ["Model", "型号"],
  ["Color", "颜色"],
  ["Thickness", "厚度"],
  ["Wear Layer", "耐磨层"],
  ["Wear layer", "耐磨层"],
  ["Size", "尺寸"],
  ["Quantity", "数量"],
  ["Area (m²)", "面积（m²）"],
  ["Area", "面积"],
  ["Price", "价格"],
  ["RMB", "人民币"],
  ["Inventory", "库存"],
  ["Models", "型号数"],
  ["Total Area", "总面积"],
  ["Total area", "总面积"],

  ["Data Quality Issues", "数据质量问题"],
  ["Data quality issues", "数据质量问题"],
  ["Missing Email", "缺少邮箱"],
  ["Missing email", "缺少邮箱"],
  ["Missing Contact", "缺少联系人"],
  ["Missing contact", "缺少联系人"],
  ["Missing Phone", "缺少电话"],
  ["Missing phone", "缺少电话"],
  ["Missing Website", "缺少网站"],
  ["Missing website", "缺少网站"],
  ["Missing Coordinates", "缺少坐标"],
  ["Missing coordinates", "缺少坐标"],
  ["Unverified Email", "未验证邮箱"],
  ["Unverified email", "未验证邮箱"],
  ["Duplicate Domains", "重复域名"],
  ["Duplicate domains", "重复域名"],

  ["Users", "用户"],
  ["User", "用户"],
  ["Full Name", "姓名"],
  ["Full name", "姓名"],
  ["Active", "启用"],
  ["Inactive", "停用"],
  ["Sales Manager", "销售经理"],
  ["Sales Representative", "销售代表"],
  ["Business Assistant", "业务助理"],
  ["BI Admin", "BI 管理员"],
  ["Administrator", "管理员"],
  ["Manage user access and assigned roles.", "管理用户访问权限与角色。"],
  ["Manage Platform users and access levels.", "管理 Platform 用户与访问级别。"],
  ["Access is based on your assigned role.", "访问权限由您的角色决定。"],

  ["Latest operational events", "最新业务活动"],
  ["newest activity appears first", "最新活动优先显示"],
  ["No activity records available.", "暂无活动记录。"],
  ["No activity records available", "暂无活动记录"],

  ["Generate Report", "生成报告"],
  ["Generate report", "生成报告"],
  ["Print / Save PDF", "打印 / 保存 PDF"],
  ["Lead Performance", "线索表现"],
  ["Email Coverage", "邮箱覆盖率"],
  ["Usable Email Coverage", "有效邮箱覆盖率"],
  ["Lead Campaign Reach", "客户开发触达"],
  ["Stock Campaign Reach", "库存推广触达"],
  ["Key Insights", "关键洞察"],
  ["Generated On", "生成时间"],
  ["Period", "期间"],
  ...additionalTranslations,
];

const EN_TO_ZH = new Map(TRANSLATIONS);
const ZH_TO_EN = new Map(TRANSLATIONS.map(([english, chinese]) => [chinese, english]));

function normalizeTranslationKey(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[_.-]+/g, " ")
    .replace(/\s+/g, " ");
}

const NORMALIZED_EN_TO_ZH = new Map(
  TRANSLATIONS.map(([english, chinese]) => [normalizeTranslationKey(english), chinese])
);
const NORMALIZED_ZH_TO_EN = new Map(
  TRANSLATIONS.map(([english, chinese]) => [normalizeTranslationKey(chinese), english])
);

const DYNAMIC_PATTERNS = [
  {
    en: /^([\d,]+) available · ([\d,]+) countries$/,
    zh: /^([\d,]+) 可认领 · ([\d,]+) 个国家$/,
    toZh: (match) => `${match[1]} 可认领 · ${match[2]} 个国家`,
    toEn: (match) => `${match[1]} available · ${match[2]} countries`,
  },
  {
    en: /^([\d,]+) leads are contactable$/,
    zh: /^([\d,]+) 条线索可联系$/,
    toZh: (match) => `${match[1]} 条线索可联系`,
    toEn: (match) => `${match[1]} leads are contactable`,
  },
  {
    en: /^([\d,]+) named decision-makers$/,
    zh: /^([\d,]+) 位已识别决策人$/,
    toZh: (match) => `${match[1]} 位已识别决策人`,
    toEn: (match) => `${match[1]} named decision-makers`,
  },
  {
    en: /^([\d,]+) mapped records$/,
    zh: /^([\d,]+) 条已定位记录$/,
    toZh: (match) => `${match[1]} 条已定位记录`,
    toEn: (match) => `${match[1]} mapped records`,
  },
  {
    en: /^([\d,]+) countries reached this month$/,
    zh: /^本月已触达 ([\d,]+) 个国家$/,
    toZh: (match) => `本月已触达 ${match[1]} 个国家`,
    toEn: (match) => `${match[1]} countries reached this month`,
  },
  {
    en: /^([\d,]+) leads have an email$/,
    zh: /^([\d,]+) 条线索有邮箱$/,
    toZh: (match) => `${match[1]} 条线索有邮箱`,
    toEn: (match) => `${match[1]} leads have an email`,
  },
  {
    en: /^([\d,]+) verified contacts$/,
    zh: /^([\d,]+) 个已验证联系人$/,
    toZh: (match) => `${match[1]} 个已验证联系人`,
    toEn: (match) => `${match[1]} verified contacts`,
  },
  {
    en: /^([\d,]+) leads have a named buyer or decision-maker$/,
    zh: /^([\d,]+) 条线索已有明确采购人或决策人$/,
    toZh: (match) => `${match[1]} 条线索已有明确采购人或决策人`,
    toEn: (match) => `${match[1]} leads have a named buyer or decision-maker`,
  },
  {
    en: /^([\d,.]+) models$/,
    zh: /^([\d,.]+) 个型号$/,
    toZh: (match) => `${match[1]} 个型号`,
    toEn: (match) => `${match[1]} models`,
  },
  {
    en: /^([\d,.]+) countries in current view$/,
    zh: /^([\d,.]+) 个当前视图中的国家$/,
    toZh: (match) => `${match[1]} 个当前视图中的国家`,
    toEn: (match) => `${match[1]} countries in current view`,
  },
  {
    en: /^([\d,.]+) records match the current filters$/,
    zh: /^([\d,.]+) 条记录符合当前筛选条件$/,
    toZh: (match) => `${match[1]} 条记录符合当前筛选条件`,
    toEn: (match) => `${match[1]} records match the current filters`,
  },
  {
    en: /^([\d,.]+) company locations plotted$/,
    zh: /^([\d,.]+) 个公司位置已绘制$/,
    toZh: (match) => `${match[1]} 个公司位置已绘制`,
    toEn: (match) => `${match[1]} company locations plotted`,
  },
  {
    en: /^([\d,.]+) visible on current map$/,
    zh: /^([\d,.]+) 个在当前地图中可见$/,
    toZh: (match) => `${match[1]} 个在当前地图中可见`,
    toEn: (match) => `${match[1]} visible on current map`,
  },
  {
    en: /^([\d,.]+) contacts consolidated at this location$/,
    zh: /^([\d,.]+) 个联系人已合并到此位置$/,
    toZh: (match) => `${match[1]} 个联系人已合并到此位置`,
    toEn: (match) => `${match[1]} contacts consolidated at this location`,
  },
  {
    en: /^([\d,.]+) scheduled actions$/,
    zh: /^([\d,.]+) 项已安排的行动$/,
    toZh: (match) => `${match[1]} 项已安排的行动`,
    toEn: (match) => `${match[1]} scheduled actions`,
  },
  {
    en: /^([\d,.]+) active lots$/,
    zh: /^([\d,.]+) 个有效批次$/,
    toZh: (match) => `${match[1]} 个有效批次`,
    toEn: (match) => `${match[1]} active lots`,
  },
  {
    en: /^([\d,.]+) countries reached$/,
    zh: /^([\d,.]+) 个已触达国家$/,
    toZh: (match) => `${match[1]} 个已触达国家`,
    toEn: (match) => `${match[1]} countries reached`,
  },
];

function sanitizeTechnicalText(value) {
  let result = value;

  SAFE_TEXT_REPLACEMENTS.forEach(([technicalText, businessText]) => {
    result = result.split(technicalText).join(businessText);
  });

  result = result.replace(
    /Updating application profile:[^|]*\|\s*PGRST\d+/gi,
    "Profile update failed. Please try again."
  );

  result = result.replace(
    /Could not find the ['"]updated_at['"] column of ['"]app_profiles['"][^|]*\|\s*PGRST\d+/gi,
    "Profile update failed. Please try again."
  );

  return result;
}

function translateCore(value, language) {
  const exact = language === "zh" ? EN_TO_ZH.get(value) : ZH_TO_EN.get(value);
  if (exact) return exact;

  const normalized =
    language === "zh"
      ? NORMALIZED_EN_TO_ZH.get(normalizeTranslationKey(value))
      : NORMALIZED_ZH_TO_EN.get(normalizeTranslationKey(value));
  if (normalized) return normalized;

  for (const pattern of DYNAMIC_PATTERNS) {
    const match = value.match(language === "zh" ? pattern.en : pattern.zh);
    if (match) return language === "zh" ? pattern.toZh(match) : pattern.toEn(match);
  }

  for (const separator of [" · ", " | "]) {
    if (!value.includes(separator)) continue;

    const parts = value.split(separator);
    const translatedParts = parts.map((part) => translateCore(part, language));
    if (translatedParts.some((part, index) => part !== parts[index])) {
      return translatedParts.join(separator);
    }
  }

  return value;
}

export function translateValue(value, language) {
  if (!value || typeof value !== "string") return value;

  const sanitized = sanitizeTechnicalText(value);
  const leading = sanitized.match(/^\s*/)?.[0] || "";
  const trailing = sanitized.match(/\s*$/)?.[0] || "";
  const core = sanitized.trim();

  if (!core) return sanitized;

  return `${leading}${translateCore(core, language)}${trailing}`;
}

function translateNode(node, language) {
  if (!node) return;

  if (node.nodeType === Node.TEXT_NODE) {
    if (!node.nodeValue?.trim()) return;
    if (node.parentElement?.closest(".MuiIcon-root, .material-icons, [class*='material-icons']")) {
      return;
    }

    const translated = translateValue(node.nodeValue, language);
    if (translated !== node.nodeValue) node.nodeValue = translated;
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;

  ["placeholder", "title", "aria-label", "alt"].forEach((attribute) => {
    if (!node.hasAttribute?.(attribute)) return;

    const current = node.getAttribute(attribute);
    const translated = translateValue(current, language);

    if (translated !== current) node.setAttribute(attribute, translated);
  });
}

export function translateTree(root, language) {
  if (!root) return;

  translateNode(root, language);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);

  let current = walker.nextNode();

  while (current) {
    translateNode(current, language);
    current = walker.nextNode();
  }

  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
}

export default function LanguageSwitcher({ inline = false }) {
  const [language, setLanguage] = useState(() =>
    window.localStorage.getItem(LANGUAGE_KEY) === "zh" ? "zh" : "en"
  );
  const [anchorEl, setAnchorEl] = useState(null);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_KEY, language);
    translateTree(document.body, language);

    let framePending = false;

    const observer = new MutationObserver((mutations) => {
      if (framePending) return;
      framePending = true;

      window.requestAnimationFrame(() => {
        mutations.forEach((mutation) => {
          if (mutation.type === "characterData") {
            translateNode(mutation.target, language);
          }

          mutation.addedNodes.forEach((node) => translateTree(node, language));

          if (mutation.type === "attributes") {
            translateNode(mutation.target, language);
          }
        });

        framePending = false;
      });
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label", "alt"],
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [language]);

  const chooseLanguage = (nextLanguage) => {
    setAnchorEl(null);

    if (nextLanguage === language) return;

    translateTree(document.body, nextLanguage);
    window.localStorage.setItem(LANGUAGE_KEY, nextLanguage);
    setLanguage(nextLanguage);
    window.dispatchEvent(
      new CustomEvent("platform-language-change", { detail: { language: nextLanguage } })
    );
  };

  return (
    <Box
      sx={
        inline
          ? { display: "inline-flex", alignItems: "center" }
          : { position: "fixed", top: 16, right: 20, zIndex: 1400 }
      }
    >
      <Button
        size="small"
        disableElevation
        onClick={(event) => setAnchorEl(event.currentTarget)}
        aria-label="Open language selector"
        startIcon={<TranslateRoundedIcon sx={{ fontSize: "17px !important" }} />}
        endIcon={<KeyboardArrowDownRoundedIcon sx={{ fontSize: "16px !important" }} />}
        sx={{
          minWidth: 82,
          height: 36,
          px: 1.1,
          color: "#262626",
          backgroundColor: "#F5F5F5",
          borderRadius: "6px",
          fontSize: 12.5,
          fontWeight: 500,
          lineHeight: 1,
          textTransform: "none",
          boxShadow: "none",
          "&:hover": { backgroundColor: "#E6F4FF", boxShadow: "none" },
          "& .MuiButton-startIcon": { mr: 0.55 },
          "& .MuiButton-endIcon": { ml: 0.3 },
        }}
      >
        {language === "zh" ? "中文" : "EN"}
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        MenuListProps={{ dense: true }}
        PaperProps={{
          sx: {
            mt: 0.8,
            minWidth: 132,
            border: "1px solid #E6EBF1",
            borderRadius: "8px",
            boxShadow: "0 6px 16px rgba(0,0,0,.08)",
          },
        }}
      >
        <MenuItem
          selected={language === "en"}
          onClick={() => chooseLanguage("en")}
          sx={{ fontSize: 13, py: 0.9 }}
        >
          English
        </MenuItem>
        <MenuItem
          selected={language === "zh"}
          onClick={() => chooseLanguage("zh")}
          sx={{ fontSize: 13, py: 0.9 }}
        >
          中文
        </MenuItem>
      </Menu>
    </Box>
  );
}

LanguageSwitcher.propTypes = { inline: PropTypes.bool };
