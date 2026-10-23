"use strict";
/* Brawl Arena — ядро: константы и утилиты. ES5: Safari iOS 6.1.3, iPhone 4s. */
var BA = {};

BA.TILE = 32;                 // размер клетки мира, px
BA.VIEW_W = 480;              // логическое разрешение экрана (рендер 480x320, CSS растягивает)
BA.VIEW_H = 320;
BA.LOGIC_FPS = 30;            // фиксированный шаг логики
BA.STEP = 1 / BA.LOGIC_FPS;

BA.WORLD_COLS = 30;
BA.WORLD_ROWS = 20;
BA.WORLD_W = BA.WORLD_COLS * BA.TILE;
BA.WORLD_H = BA.WORLD_ROWS * BA.TILE;

BA.GEMS_TO_WIN = 10;
BA.COUNTDOWN_S = 15;
BA.GEM_SPAWN_S = 5;
BA.GEMS_ON_FIELD_MAX = 10;
BA.RESPAWN_S = 3;
BA.REGEN_DELAY_S = 3;
BA.INVULN_S = 1.5;

// Боец «Скаут» (оригинальный персонаж игры, не из Brawl Stars Supercell)
BA.BRAWLER = {
  hp: 3200,
  speed: 84,          // px/с (~2.6 клетки/с)
  radius: 11,
  range: 224,         // 7 клеток
  bulletSpeed: 260,
  bulletDamage: 400,
  bulletRadius: 5,
  reloadS: 1.2,       // на один патрон
  maxAmmo: 3
};

BA.TEAM_BLUE = 0;
BA.TEAM_RED = 1;
BA.TEAM_COLOR = ["#3aa0ff", "#ff5a4e"];

BA.rand = function (min, max) {
  return min + Math.random() * (max - min);
};

BA.randInt = function (min, max) {
  return Math.floor(BA.rand(min, max + 1));
};

BA.clamp = function (v, min, max) {
  return v < min ? min : (v > max ? max : v);
};

BA.dist = function (ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
};

BA.dist2 = function (ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
};

BA.norm = function (dx, dy) {
  var len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.0001) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
};

// Кратчайший угол между направлениями, для плавного поворота ботов
BA.angleDiff = function (a, b) {
  var d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

// Нормализация строки карты до точной ширины, чтобы опечатки не ломали игру
BA.normalizeRow = function (row, width, fill) {
  var out = "";
  var i;
  for (i = 0; i < width; i++) {
    out += i < row.length ? row.charAt(i) : fill;
  }
  return out;
};
