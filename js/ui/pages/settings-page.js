// ══════════════════════════════════════════════════════════════════
//  pages/settings-page.js — صفحة الإعدادات (العرض فقط)
//  يستخدم دوال core/settings.js
// ══════════════════════════════════════════════════════════════════
import { APP_SETTINGS, conn } from '../../state.js';
import { escapeHtml, baseCur } from '../../core/utils.js';
import {
  renderSettings as coreRenderSettings,
  addSettingsCurrency as coreAddCurrency,
  renameSettingsCurrency as coreRenameCurrency,
  removeSettingsCurrency as coreRemoveCurrency,
  saveGeneralSettings as coreSaveGeneral,
  saveGoldApiKey as coreSaveGoldApiKey
} from '../../core/settings.js';

// نُعيد التصدير لتكون متاحة عبر window في main.js
export const renderSettings = coreRenderSettings;
export const addSettingsCurrency = coreAddCurrency;
export const renameSettingsCurrency = coreRenameCurrency;
export const removeSettingsCurrency = coreRemoveCurrency;
export const saveGeneralSettings = coreSaveGeneral;
export const saveGoldApiKey = coreSaveGoldApiKey;

// متوافق مع onclick القديم
export function saveGeneralSettingsCompat() { return coreSaveGeneral(); }
