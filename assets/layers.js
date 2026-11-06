// Каталог подложек и накладываемых слоёв. Используется страницей и проверочным скриптом.
// kind: base — подложка (одна), overlay — накладываемый тайловый слой, data — слой живых данных страницы.
// Шаблон URL: {s} поддомен, {z}/{x}/{y} тайл, {r} ретина, {date} дата снимка (NASA), {key} ключ, {rv} путь RainViewer.
// key: какой ключ нужен (carto, owm, tomtom, thunderforest, stadia). unofficial: доступ без официального API, может отключиться.

export const KEYS = {
  carto: { name: "CARTO", url: "https://carto.com/basemaps/apikey", note: "бесплатно, до 5 млн тайлов в месяц, без регистрации" },
  owm: { name: "OpenWeatherMap", url: "https://home.openweathermap.org/api_keys", note: "бесплатный тариф: погодные слои" },
  tomtom: { name: "TomTom", url: "https://developer.tomtom.com", note: "бесплатно 2 500 запросов в сутки: пробки и инциденты" },
  thunderforest: { name: "Thunderforest", url: "https://www.thunderforest.com/pricing/", note: "бесплатно 150 тыс. тайлов в месяц: транспортные и ландшафтные карты" },
  stadia: { name: "Stadia Maps", url: "https://client.stadiamaps.com/signup/", note: "бесплатно для некоммерческого использования: карты Stamen" }
};

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
const esri = (p) => `${ESRI}${p}/MapServer/tile/{z}/{y}/{x}`;
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/";
const gibs = (layer, level, ext) => `${GIBS}${layer}/default/{date}/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.${ext}`;
const EOX = (l, ext) => `https://tiles.maps.eox.at/wmts/1.0.0/${l}_3857/default/g/{z}/{y}/{x}.${ext}`;
const A = {
  osm: "© OpenStreetMap contributors", esri: "Esri, Maxar, Earthstar Geographics, GIS User Community",
  gibs: "NASA GIBS / Worldview", eox: "EOX, Sentinel-2 cloudless (Copernicus)", google: "Google", rv: "RainViewer"
};

export const CATALOG = [
  // ---------------- ПОДЛОЖКИ ----------------
  { id: "esri-dark", kind: "base", group: "Схемы", name: "Тёмная схема (Esri)", url: esri("Canvas/World_Dark_Gray_Base"), native: 16, max: 18, attr: A.esri, dark: true },
  { id: "esri-light", kind: "base", group: "Схемы", name: "Светлая схема (Esri)", url: esri("Canvas/World_Light_Gray_Base"), native: 16, max: 18, attr: A.esri },
  { id: "osm", kind: "base", group: "Схемы", name: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", max: 19, attr: A.osm },
  { id: "osm-hot", kind: "base", group: "Схемы", name: "OSM Humanitarian", url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", sub: "abc", max: 19, attr: A.osm + ", HOT" },
  { id: "cyclosm", kind: "base", group: "Схемы", name: "CyclOSM (дороги и рельеф)", url: "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", sub: "abc", max: 19, attr: A.osm + ", CyclOSM" },
  { id: "opnv", kind: "base", group: "Схемы", name: "ÖPNVKarte (общественный транспорт)", url: "https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png", max: 18, attr: A.osm + ", memomaps.de" },
  { id: "2gis", kind: "base", group: "Схемы", name: "2ГИС", url: "https://tile{s}.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1", sub: "0123", max: 18, attr: "2GIS", unofficial: true },

  { id: "g-road", kind: "base", group: "Google", name: "Google Карта", url: "https://mt{s}.google.com/vt/lyrs=m&hl=ru&x={x}&y={y}&z={z}", sub: "0123", max: 20, attr: A.google, unofficial: true },
  { id: "g-sat", kind: "base", group: "Google", name: "Google Спутник", url: "https://mt{s}.google.com/vt/lyrs=s&hl=ru&x={x}&y={y}&z={z}", sub: "0123", max: 20, attr: A.google, unofficial: true, dark: true },
  { id: "g-hybrid", kind: "base", group: "Google", name: "Google Гибрид", url: "https://mt{s}.google.com/vt/lyrs=y&hl=ru&x={x}&y={y}&z={z}", sub: "0123", max: 20, attr: A.google, unofficial: true, dark: true },
  { id: "g-terrain", kind: "base", group: "Google", name: "Google Рельеф", url: "https://mt{s}.google.com/vt/lyrs=p&hl=ru&x={x}&y={y}&z={z}", sub: "0123", max: 20, attr: A.google, unofficial: true },

  { id: "esri-sat", kind: "base", group: "Esri", name: "Спутник (World Imagery)", url: esri("World_Imagery"), max: 19, attr: A.esri, dark: true },
  { id: "esri-clarity", kind: "base", group: "Esri", name: "Спутник Clarity (чётче)", url: "https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", max: 19, attr: A.esri, dark: true },
  { id: "esri-street", kind: "base", group: "Esri", name: "Улицы (World Street Map)", url: esri("World_Street_Map"), max: 19, attr: A.esri },
  { id: "esri-topo", kind: "base", group: "Esri", name: "Топографическая (World Topo)", url: esri("World_Topo_Map"), max: 19, attr: A.esri },
  { id: "esri-natgeo", kind: "base", group: "Esri", name: "National Geographic", url: esri("NatGeo_World_Map"), native: 16, max: 18, attr: A.esri + ", National Geographic" },
  { id: "esri-physical", kind: "base", group: "Esri", name: "Физическая карта", url: esri("World_Physical_Map"), native: 8, max: 12, attr: A.esri },
  { id: "esri-relief", kind: "base", group: "Esri", name: "Отмывка рельефа", url: esri("World_Shaded_Relief"), native: 13, max: 16, attr: A.esri },
  { id: "esri-terrain", kind: "base", group: "Esri", name: "Рельеф (Terrain Base)", url: esri("World_Terrain_Base"), native: 13, max: 16, attr: A.esri },
  { id: "esri-ocean", kind: "base", group: "Esri", name: "Океан и Каспий (батиметрия)", url: esri("Ocean/World_Ocean_Base"), native: 13, max: 16, attr: A.esri, dark: true },

  { id: "opentopo", kind: "base", group: "Топография", name: "OpenTopoMap", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", sub: "abc", native: 17, max: 18, attr: A.osm + ", SRTM, OpenTopoMap (CC-BY-SA)" },
  { id: "eox-terrain", kind: "base", group: "Топография", name: "EOX Terrain Light", url: EOX("terrain-light", "jpg"), native: 16, max: 18, attr: A.eox },
  { id: "eox-terrain-full", kind: "base", group: "Топография", name: "EOX Terrain", url: EOX("terrain", "jpg"), native: 16, max: 18, attr: A.eox },

  { id: "eox-s2", kind: "base", group: "Спутник и космос", name: "Sentinel-2 без облаков (EOX)", url: EOX("s2cloudless-2024", "jpg"), native: 17, max: 19, attr: A.eox, dark: true },
  { id: "gibs-viirs", kind: "base", group: "Спутник и космос", name: "NASA VIIRS, снимок за дату", url: gibs("VIIRS_SNPP_CorrectedReflectance_TrueColor", 9, "jpg"), native: 9, max: 14, attr: A.gibs, gibs: true, dark: true },
  { id: "gibs-modis", kind: "base", group: "Спутник и космос", name: "NASA MODIS Terra, снимок за дату", url: gibs("MODIS_Terra_CorrectedReflectance_TrueColor", 9, "jpg"), native: 9, max: 14, attr: A.gibs, gibs: true, dark: true },
  { id: "eox-blackmarble", kind: "base", group: "Спутник и космос", name: "Ночные огни (Black Marble)", url: EOX("blackmarble", "jpg"), native: 8, max: 12, attr: A.eox + ", NASA Black Marble", dark: true },
  { id: "eox-bluemarble", kind: "base", group: "Спутник и космос", name: "Blue Marble", url: EOX("bluemarble", "jpg"), native: 8, max: 12, attr: A.eox + ", NASA Blue Marble" },

  { id: "carto-dark", kind: "base", group: "С ключом", name: "CARTO тёмная", url: "https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key={key}", sub: "abcd", max: 19, attr: A.osm + ", © CARTO", key: "carto", dark: true },
  { id: "carto-light", kind: "base", group: "С ключом", name: "CARTO светлая", url: "https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key={key}", sub: "abcd", max: 19, attr: A.osm + ", © CARTO", key: "carto" },
  { id: "carto-voyager", kind: "base", group: "С ключом", name: "CARTO Voyager", url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key={key}", sub: "abcd", max: 19, attr: A.osm + ", © CARTO", key: "carto" },
  { id: "tf-transport", kind: "base", group: "С ключом", name: "Thunderforest Transport", url: "https://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey={key}", sub: "abc", max: 19, attr: A.osm + ", Thunderforest", key: "thunderforest" },
  { id: "tf-transport-dark", kind: "base", group: "С ключом", name: "Thunderforest Transport Dark", url: "https://{s}.tile.thunderforest.com/transport-dark/{z}/{x}/{y}.png?apikey={key}", sub: "abc", max: 19, attr: A.osm + ", Thunderforest", key: "thunderforest", dark: true },
  { id: "tf-landscape", kind: "base", group: "С ключом", name: "Thunderforest Landscape", url: "https://{s}.tile.thunderforest.com/landscape/{z}/{x}/{y}.png?apikey={key}", sub: "abc", max: 19, attr: A.osm + ", Thunderforest", key: "thunderforest" },
  { id: "stamen-terrain", kind: "base", group: "С ключом", name: "Stamen Terrain (Stadia)", url: "https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png?api_key={key}", max: 18, attr: A.osm + ", Stamen, Stadia Maps", key: "stadia" },
  { id: "stamen-toner", kind: "base", group: "С ключом", name: "Stamen Toner (Stadia)", url: "https://tiles.stadiamaps.com/tiles/stamen_toner/{z}/{x}/{y}{r}.png?api_key={key}", max: 18, attr: A.osm + ", Stamen, Stadia Maps", key: "stadia" },
  { id: "stadia-dark", kind: "base", group: "С ключом", name: "Stadia Alidade Dark", url: "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key={key}", max: 18, attr: A.osm + ", Stadia Maps", key: "stadia", dark: true },

  // ---------------- СЛОИ ----------------
  { id: "planes", kind: "data", group: "Живые данные", name: "Самолёты (ADS-B)" },
  { id: "airports", kind: "data", group: "Живые данные", name: "Аэропорты по METAR" },
  { id: "roads", kind: "data", group: "Живые данные", name: "Дороги по погоде" },
  { id: "temp", kind: "data", group: "Живые данные", name: "Температура, сетка Open-Meteo" },
  { id: "cities", kind: "data", group: "Живые данные", name: "Города и температура" },
  { id: "quakes", kind: "data", group: "Живые данные", name: "Землетрясения (USGS)" },
  { id: "ships", kind: "data", group: "Живые данные", name: "Суда и порты (AIS)" },
  { id: "borders", kind: "data", group: "Живые данные", name: "Пункты пропуска" },
  { id: "pipes", kind: "data", group: "Живые данные", name: "Трубопроводы (схема)" },

  { id: "rv-radar", kind: "overlay", group: "Погода и климат", name: "Осадки по радару (RainViewer)", url: "https://tilecache.rainviewer.com{rv}/256/{z}/{x}/{y}/2/1_1.png", rv: "radar", native: 7, max: 14, attr: A.rv, op: 0.8, note: "радаров в Казахстане мало, покрытие частичное" },
  { id: "rv-ir", kind: "overlay", group: "Погода и климат", name: "Облачность, спутник ИК (RainViewer)", url: "https://tilecache.rainviewer.com{rv}/256/{z}/{x}/{y}/0/0_0.png", rv: "ir", native: 7, max: 14, attr: A.rv, op: 0.6 },
  { id: "gibs-lst", kind: "overlay", group: "Погода и климат", name: "Температура поверхности, день (NASA MODIS)", url: gibs("MODIS_Terra_L3_Land_Surface_Temp_Daily_Day", 7, "png"), native: 7, max: 12, attr: A.gibs, gibs: true, op: 0.7 },
  { id: "gibs-lst-night", kind: "overlay", group: "Погода и климат", name: "Температура поверхности, ночь (NASA MODIS)", url: gibs("MODIS_Terra_L3_Land_Surface_Temp_Daily_Night", 7, "png"), native: 7, max: 12, attr: A.gibs, gibs: true, op: 0.7 },
  { id: "gibs-snow", kind: "overlay", group: "Погода и климат", name: "Снежный покров (NASA MODIS)", url: gibs("MODIS_Terra_L3_NDSI_Snow_Cover_Daily", 8, "png"), native: 8, max: 12, attr: A.gibs, gibs: true, op: 0.75 },
  { id: "gibs-fires", kind: "overlay", group: "Погода и климат", name: "Пожары и тепловые аномалии (NASA VIIRS)", url: gibs("VIIRS_SNPP_Thermal_Anomalies_375m_Day", 8, "png"), native: 8, max: 12, attr: A.gibs, gibs: true, op: 0.9 },
  { id: "gibs-aod", kind: "overlay", group: "Погода и климат", name: "Пыль и аэрозоль (NASA MODIS AOD)", url: gibs("MODIS_Terra_Aerosol", 6, "png"), native: 6, max: 10, attr: A.gibs, gibs: true, op: 0.7 },
  { id: "gibs-airtemp", kind: "overlay", group: "Погода и климат", name: "Температура воздуха у поверхности (NASA AIRS)", url: gibs("AIRS_L2_Surface_Air_Temperature_Day", 6, "png"), native: 6, max: 10, attr: A.gibs, gibs: true, op: 0.7 },
  { id: "gibs-precip", kind: "overlay", group: "Погода и климат", name: "Осадки за сутки (NASA IMERG)", url: gibs("IMERG_Precipitation_Rate", 6, "png"), native: 6, max: 10, attr: A.gibs, gibs: true, op: 0.75 },
  { id: "gibs-sst", kind: "overlay", group: "Погода и климат", name: "Температура воды Каспия (NASA MUR SST)", url: gibs("GHRSST_L4_MUR_Sea_Surface_Temperature", 7, "png"), native: 7, max: 11, attr: A.gibs, gibs: true, op: 0.8 },
  { id: "gibs-night", kind: "overlay", group: "Погода и климат", name: "Ночные огни за дату (NASA VIIRS)", url: gibs("VIIRS_SNPP_DayNightBand_At_Sensor_Radiance", 8, "png"), native: 8, max: 12, attr: A.gibs, gibs: true, op: 0.9 },
  { id: "owm-temp", kind: "overlay", group: "Погода и климат", name: "Температура (OpenWeatherMap)", url: "https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid={key}", max: 18, attr: "OpenWeatherMap", key: "owm", op: 0.7 },
  { id: "owm-precip", kind: "overlay", group: "Погода и климат", name: "Осадки (OpenWeatherMap)", url: "https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid={key}", max: 18, attr: "OpenWeatherMap", key: "owm", op: 0.8 },
  { id: "owm-clouds", kind: "overlay", group: "Погода и климат", name: "Облачность (OpenWeatherMap)", url: "https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid={key}", max: 18, attr: "OpenWeatherMap", key: "owm", op: 0.7 },
  { id: "owm-wind", kind: "overlay", group: "Погода и климат", name: "Ветер (OpenWeatherMap)", url: "https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid={key}", max: 18, attr: "OpenWeatherMap", key: "owm", op: 0.7 },
  { id: "owm-pressure", kind: "overlay", group: "Погода и климат", name: "Давление (OpenWeatherMap)", url: "https://tile.openweathermap.org/map/pressure_new/{z}/{x}/{y}.png?appid={key}", max: 18, attr: "OpenWeatherMap", key: "owm", op: 0.6 },

  { id: "orm", kind: "overlay", group: "Транспорт и логистика", name: "Железные дороги (OpenRailwayMap)", url: "https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png", sub: "abc", max: 19, attr: A.osm + ", OpenRailwayMap", op: 0.8 },
  { id: "orm-speed", kind: "overlay", group: "Транспорт и логистика", name: "ЖД: допустимые скорости", url: "https://{s}.tiles.openrailwaymap.org/maxspeed/{z}/{x}/{y}.png", sub: "abc", max: 19, attr: A.osm + ", OpenRailwayMap", op: 0.8 },
  { id: "orm-electric", kind: "overlay", group: "Транспорт и логистика", name: "ЖД: электрификация", url: "https://{s}.tiles.openrailwaymap.org/electrification/{z}/{x}/{y}.png", sub: "abc", max: 19, attr: A.osm + ", OpenRailwayMap", op: 0.8 },
  { id: "esri-transport", kind: "overlay", group: "Транспорт и логистика", name: "Дороги и трассы (Esri Transportation)", url: esri("Reference/World_Transportation"), max: 19, attr: A.esri, op: 0.9 },
  { id: "g-roads", kind: "overlay", group: "Транспорт и логистика", name: "Дороги и подписи (Google)", url: "https://mt{s}.google.com/vt/lyrs=h&hl=ru&x={x}&y={y}&z={z}", sub: "0123", max: 20, attr: A.google, unofficial: true, op: 0.9 },
  { id: "g-traffic", kind: "overlay", group: "Транспорт и логистика", name: "Пробки (Google)", url: "https://mt{s}.google.com/vt?lyrs=h@159000000,traffic|seconds_into_week:-1&style=3&x={x}&y={y}&z={z}", sub: "0123", max: 20, attr: A.google, unofficial: true, op: 0.9 },
  { id: "tomtom-flow", kind: "overlay", group: "Транспорт и логистика", name: "Пробки (TomTom)", url: "https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key={key}", max: 18, attr: "TomTom Traffic", key: "tomtom", op: 0.9 },
  { id: "tomtom-incidents", kind: "overlay", group: "Транспорт и логистика", name: "ДТП и перекрытия (TomTom)", url: "https://api.tomtom.com/traffic/map/4/tile/incidents/s3/{z}/{x}/{y}.png?key={key}", max: 18, attr: "TomTom Traffic", key: "tomtom", op: 0.9 },
  { id: "openseamap", kind: "overlay", group: "Транспорт и логистика", name: "Морская навигация (OpenSeaMap)", url: "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", max: 18, attr: A.osm + ", OpenSeaMap", op: 1 },

  { id: "esri-places", kind: "overlay", group: "Справочные и рельеф", name: "Границы и названия (Esri)", url: esri("Reference/World_Boundaries_and_Places"), max: 19, attr: A.esri, op: 1 },
  { id: "esri-dark-ref", kind: "overlay", group: "Справочные и рельеф", name: "Подписи для тёмной схемы (Esri)", url: esri("Canvas/World_Dark_Gray_Reference"), native: 16, max: 18, attr: A.esri, op: 1 },
  { id: "eox-overlay", kind: "overlay", group: "Справочные и рельеф", name: "Дороги и подписи (EOX)", url: EOX("overlay_bright", "png"), native: 16, max: 18, attr: A.eox, op: 1 },
  { id: "esri-hillshade", kind: "overlay", group: "Справочные и рельеф", name: "Тени рельефа (Esri Hillshade)", url: esri("Elevation/World_Hillshade"), native: 16, max: 18, attr: A.esri, op: 0.45 },
  { id: "gibs-coast", kind: "overlay", group: "Справочные и рельеф", name: "Береговые линии (NASA)", url: `${GIBS}Coastlines_15m/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`, native: 9, max: 12, attr: A.gibs, op: 1 }
];

export const GROUP_ORDER = {
  base: ["Схемы", "Google", "Esri", "Топография", "Спутник и космос", "С ключом"],
  overlay: ["Живые данные", "Погода и климат", "Транспорт и логистика", "Справочные и рельеф"]
};

// Дата снимка по умолчанию: вчера по UTC (данные за сегодня ещё не обработаны)
export function defaultGibsDate() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}
