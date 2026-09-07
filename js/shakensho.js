// 電子車検証データ(車検証閲覧アプリのエクスポートJSON)の正規化。
// app/shakensho_import.py (Pythonサーバー版)からロジックをそのまま移植したもの。
// 出典・キー名の根拠は元ファイルのコメント参照(国土交通省「車検証情報取込みファイル仕様書」)。

const KEI_JIDOSHA_CODE = "02";
const SAME_AS_OWNER_SENTINEL_TOUROKUSHA = "＊＊＊";
const SAME_AS_USER_SENTINEL_KEI_NAME = "使用者に同じ";
const SAME_AS_USER_SENTINEL_KEI_ADDRESS = "使用者住所に同じ";

const NORMALIZE_KEY_MAP = {
  shatai_bangou: ["CarNo"],
  touroku_bangou_zenbun: ["EntryNoCarNo"],
  touroku_bangou_qr_fixed: ["TwodimensionCodeInfoEntryNoCarNo"],
  shoyusha_shimei: ["OwnernameHighLevelChar", "OwnernameLowLevelChar"],
  shiyousha_shimei: ["UsernameHighLevelChar", "UsernameLowLevelChar"],
  yukokigen_era: ["ValidPeriodExpirdateE"],
  yukokigen_year: ["ValidPeriodExpirdateY"],
  yukokigen_month: ["ValidPeriodExpirdateM"],
  yukokigen_day: ["ValidPeriodExpirdateD"],
};

function firstPresent(raw, candidates) {
  for (const key of candidates) {
    if (raw && raw[key]) return String(raw[key]).trim();
  }
  return null;
}

function getAddress(certInfo, singleKey, charKey, numKey) {
  const single = firstPresent(certInfo, [singleKey]);
  if (single !== null) return single;
  const charPart = firstPresent(certInfo, [charKey]);
  if (!charPart) return null;
  const numPart = firstPresent(certInfo, [numKey]);
  return numPart ? `${charPart}${numPart}` : charPart;
}

function normalizeShakensho(raw) {
  const certInfo = raw && typeof raw.CertInfo === "object" && raw.CertInfo !== null ? raw.CertInfo : raw;
  const isKei = firstPresent(certInfo, ["RegistCarLightCar"]) === KEI_JIDOSHA_CODE;

  const result = {};
  for (const [internalKey, candidates] of Object.entries(NORMALIZE_KEY_MAP)) {
    result[internalKey] = firstPresent(certInfo, candidates);
  }

  const shoyushaShimeiRaw = result.shoyusha_shimei;
  const shiyoushaShimeiRaw = result.shiyousha_shimei;
  delete result.shoyusha_shimei;
  delete result.shiyousha_shimei;
  const shoyushaJushoRaw = getAddress(certInfo, "OwnerAddress", "OwnerAddressChar", "OwnerAddressNumValue");
  const shiyoushaJushoRaw = getAddress(certInfo, "UserAddress", "UserAddressChar", "UserAddressNumValue");

  if (isKei) {
    result.shoyusha_shimei = shoyushaShimeiRaw === SAME_AS_USER_SENTINEL_KEI_NAME ? shiyoushaShimeiRaw : shoyushaShimeiRaw;
    result.shoyusha_jusho = shoyushaJushoRaw === SAME_AS_USER_SENTINEL_KEI_ADDRESS ? shiyoushaJushoRaw : shoyushaJushoRaw;
    result.shiyousha_shimei = shiyoushaShimeiRaw;
    result.shiyousha_jusho = shiyoushaJushoRaw;
  } else {
    result.shoyusha_shimei = shoyushaShimeiRaw;
    result.shoyusha_jusho = shoyushaJushoRaw;
    result.shiyousha_shimei = shiyoushaShimeiRaw === SAME_AS_OWNER_SENTINEL_TOUROKUSHA ? shoyushaShimeiRaw : shiyoushaShimeiRaw;
    result.shiyousha_jusho = shiyoushaJushoRaw === SAME_AS_OWNER_SENTINEL_TOUROKUSHA ? shoyushaJushoRaw : shiyoushaJushoRaw;
  }

  const era = result.yukokigen_era;
  const year = result.yukokigen_year;
  const month = result.yukokigen_month;
  const day = result.yukokigen_day;
  delete result.yukokigen_era;
  delete result.yukokigen_year;
  delete result.yukokigen_month;
  delete result.yukokigen_day;
  result.yukokigen = era && year && month && day ? `${era}${year}年${month}月${day}日` : null;
  result.is_kei_jidosha = isKei;

  return result;
}

function flattenKeyPaths(obj, prefix = "") {
  const paths = [];
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj)) {
      const childPrefix = prefix ? `${prefix}.${key}` : String(key);
      if (value && typeof value === "object") {
        paths.push(...flattenKeyPaths(value, childPrefix));
      } else {
        paths.push(childPrefix);
      }
    }
  } else if (Array.isArray(obj)) {
    if (obj.length) {
      paths.push(...flattenKeyPaths(obj[0], `${prefix}[]`));
    } else {
      paths.push(`${prefix}[]`);
    }
  }
  return paths;
}

const ZENKAKU_DIGITS = "０１２３４５６７８９";
function zenkakuToHankaku(s) {
  return s.replace(/[０-９]/g, (ch) => String(ZENKAKU_DIGITS.indexOf(ch)));
}

function splitFixedWidthRegistration(fixed) {
  if (!fixed || fixed.length < 12) return null;
  const stripChars = /^[　 ]+|[　 ]+$/g;
  const jimusho = fixed.slice(0, 4).replace(stripChars, "");
  const bunrui = zenkakuToHankaku(fixed.slice(4, 7).replace(stripChars, ""));
  const kana = fixed.slice(7, 8).replace(stripChars, "");
  const ichirenban = zenkakuToHankaku(fixed.slice(8, 12).replace(stripChars, ""));
  return {
    jimusho: jimusho || null,
    bunrui: bunrui || null,
    kana: kana || null,
    ichirenban: ichirenban || null,
  };
}

function splitRegistrationNumber(zenbun, qrFixed) {
  const fixedResult = splitFixedWidthRegistration(qrFixed || null);
  if (fixedResult) return fixedResult;
  if (!zenbun) return { jimusho: null, bunrui: null, kana: null, ichirenban: null };
  const parts = zenbun.replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length >= 4) {
    return { jimusho: parts[0], bunrui: parts[1], kana: parts[2], ichirenban: parts[3] };
  }
  return { jimusho: null, bunrui: null, kana: null, ichirenban: zenbun };
}

window.Shakensho = { normalizeShakensho, flattenKeyPaths, splitRegistrationNumber };
