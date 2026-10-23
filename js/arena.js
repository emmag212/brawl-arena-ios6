"use strict";
/* Brawl Arena — арена: сетка клеток, коллизии, линия видимости, пререндер тайлов. */

/*
  Клетки: '#' стена, '.' земля, 'B' куст (скрывает), 'g' точка спавна гемов,
  '1' спавн синей команды, '2' спавн красной.
  Карта симметрична: слева синие, справа красные, гемы в центре.
*/
BA.MAP_ROWS = [
  "##############################",
  "#............................#",
  "#.BB......................BB.#",
  "#.BB....##..........##....BB.#",
  "#...........B....B...........#",
  "#....##......B..B......##....#",
  "#....##.................##...#",
  "#............................#",
  "#..........#......#..........#",
  "#..1.BB....#..gg..#....BB..2.#",
  "#..1.BB....#..gg..#....BB..2.#",
  "#..........#......#..........#",
  "#............................#",
  "#...##.................##....#",
  "#....##......B..B......##....#",
  "#...........B....B...........#",
  "#.BB....##..........##....BB.#",
  "#.BB......................BB.#",
  "#............................#",
  "##############################"
];

BA.Arena = function () {
  this.cols = BA.WORLD_COLS;
  this.rows = BA.WORLD_ROWS;
  this.grid = [];        // символ клетки
  this.blueSpawns = [];
  this.redSpawns = [];
  this.gemSpawns = [];
  this.atlas = null;     // пререндеренные тайлы
  this.build();
  this.prerender();
};

BA.Arena.prototype.tileAt = function (col, row) {
  if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return "#";
  return this.grid[row].charAt(col);
};

BA.Arena.prototype.isWall = function (col, row) {
  return this.tileAt(col, row) === "#";
};

// Пиксельные проверки
BA.Arena.prototype.wallAtPx = function (x, y) {
  return this.isWall(Math.floor(x / BA.TILE), Math.floor(y / BA.TILE));
};

BA.Arena.prototype.isBush = function (col, row) {
  return this.tileAt(col, row) === "B";
};

BA.Arena.prototype.bushAtPx = function (x, y) {
  return this.isBush(Math.floor(x / BA.TILE), Math.floor(y / BA.TILE));
};

// Круг радиуса r может стоять в точке (учитывая стены вокруг)
BA.Arena.prototype.circleFits = function (x, y, r) {
  var c0 = Math.floor((x - r) / BA.TILE), c1 = Math.floor((x + r) / BA.TILE);
  var r0 = Math.floor((y - r) / BA.TILE), r1 = Math.floor((y + r) / BA.TILE);
  var col, row;
  for (row = r0; row <= r1; row++) {
    for (col = c0; col <= c1; col++) {
      if (!this.isWall(col, row)) continue;
      var nx = BA.clamp(x, col * BA.TILE, col * BA.TILE + BA.TILE);
      var ny = BA.clamp(y, row * BA.TILE, row * BA.TILE + BA.TILE);
      if (BA.dist2(x, y, nx, ny) < r * r) return false;
    }
  }
  return true;
};

// Движение с раздельным скольжением по осям
BA.Arena.prototype.moveCircle = function (ent, dx, dy, r) {
  if (dx !== 0 && this.circleFits(ent.x + dx, ent.y, r)) ent.x += dx;
  if (dy !== 0 && this.circleFits(ent.x, ent.y + dy, r)) ent.y += dy;
};

// Линия видимости: шаг по 8px, стены перекрывают
BA.Arena.prototype.hasLos = function (ax, ay, bx, by) {
  var d = BA.dist(ax, ay, bx, by);
  var steps = Math.ceil(d / 8);
  var i;
  for (i = 1; i < steps; i++) {
    var t = i / steps;
    if (this.wallAtPx(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
};

BA.Arena.prototype.build = function () {
  var r;
  for (r = 0; r < this.rows; r++) {
    this.grid.push(BA.normalizeRow(BA.MAP_ROWS[r] || "", this.cols, "."));
  }
  // границы всегда стены
  for (r = 0; r < this.rows; r++) {
    var row = this.grid[r].split("");
    row[0] = "#";
    row[this.cols - 1] = "#";
    this.grid[r] = row.join("");
  }
  var row_i, col;
  for (row_i = 0; row_i < this.rows; row_i++) {
    for (col = 0; col < this.cols; col++) {
      var ch = this.grid[row_i].charAt(col);
      var cx = col * BA.TILE + BA.TILE / 2;
      var cy = row_i * BA.TILE + BA.TILE / 2;
      if (ch === "g") this.gemSpawns.push({ x: cx, y: cy });
      else if (ch === "1") this.blueSpawns.push({ x: cx, y: cy });
      else if (ch === "2") this.redSpawns.push({ x: cx, y: cy });
    }
  }
};

// Пререндер: земля и стены один раз на офскрин-канвас, кусты отдельным слоем.
// На A5 это главный выигрыш: в кадре один drawImage мира + один кустов.
BA.Arena.prototype.prerender = function () {
  var i;
  this.atlas = document.createElement("canvas");
  this.atlas.width = BA.WORLD_W;
  this.atlas.height = BA.WORLD_H;
  var g = this.atlas.getContext("2d");

  this.bushLayer = document.createElement("canvas");
  this.bushLayer.width = BA.WORLD_W;
  this.bushLayer.height = BA.WORLD_H;
  var b = this.bushLayer.getContext("2d");

  var col, row, x, y;
  for (row = 0; row < this.rows; row++) {
    for (col = 0; col < this.cols; col++) {
      x = col * BA.TILE;
      y = row * BA.TILE;
      var ch = this.grid[row].charAt(col);
      // земля: два оттенка шахматкой
      g.fillStyle = ((col + row) % 2 === 0) ? "#8bc34a" : "#7cb342";
      g.fillRect(x, y, BA.TILE, BA.TILE);
      if (ch === "#") {
        g.fillStyle = "#5d4037";
        g.fillRect(x, y, BA.TILE, BA.TILE);
        g.fillStyle = "#795548";
        g.fillRect(x + 2, y + 2, BA.TILE - 4, BA.TILE - 4);
        g.fillStyle = "#8d6e63";
        g.fillRect(x + 4, y + 4, BA.TILE - 12, BA.TILE - 12);
      } else if (ch === "B") {
        b.fillStyle = "#33691e";
        b.fillRect(x + 1, y + 1, BA.TILE - 2, BA.TILE - 2);
        b.fillStyle = "#43a047";
        for (i = 0; i < 5; i++) {
          var dx = x + 4 + ((i * 13 + col * 7) % (BA.TILE - 8));
          var dy = y + 4 + ((i * 11 + row * 5) % (BA.TILE - 8));
          b.fillRect(dx, dy, 8, 6);
        }
        b.fillStyle = "#4caf50";
        b.fillRect(x + 8, y + 8, 6, 5);
        b.fillRect(x + 18, y + 16, 7, 5);
      }
    }
  }
};

BA.Arena.prototype.drawWorld = function (ctx, camX, camY, viewW, viewH) {
  ctx.drawImage(
    this.atlas,
    camX, camY, viewW, viewH,
    0, 0, viewW, viewH
  );
};

BA.Arena.prototype.drawBushes = function (ctx, camX, camY, viewW, viewH) {
  ctx.drawImage(
    this.bushLayer,
    camX, camY, viewW, viewH,
    0, 0, viewW, viewH
  );
};
