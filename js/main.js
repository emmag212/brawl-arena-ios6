"use strict";
/* Brawl Arena — цикл, ввод (тач + мышь/клавиатура), камера, отрисовка, HUD. */

BA.canvas = document.getElementById("game");
BA.ctx = BA.canvas.getContext("2d");
BA.ctx.imageSmoothingEnabled = false;

/* ---------- Экран: вписываем 480x320 с полосами, как делает игра 2018 ---------- */
BA.fitScreen = function () {
  var vw = window.innerWidth, vh = window.innerHeight;
  var scale = Math.min(vw / BA.VIEW_W, vh / BA.VIEW_H);
  var w = Math.floor(BA.VIEW_W * scale), h = Math.floor(BA.VIEW_H * scale);
  var c = BA.canvas.style;
  c.width = w + "px";
  c.height = h + "px";
  c.left = Math.floor((vw - w) / 2) + "px";
  c.top = Math.floor((vh - h) / 2) + "px";
};
window.addEventListener("resize", BA.fitScreen, false);
window.addEventListener("orientationchange", BA.fitScreen, false);

/* ---------- Состояние приложения ---------- */
BA.state = "menu";           // menu | battle | over
BA.arena = new BA.Arena();
BA.battle = null;
BA.fps = 60;
BA.debug = /#debug/.test(location.hash);

/* ---------- Ввод ---------- */
BA.input = {
  moveId: null, aimId: null,
  moveBase: { x: 0, y: 0 }, moveVec: { x: 0, y: 0 },
  aimBase: { x: 0, y: 0 }, aimVec: { x: 0, y: 0 },
  keys: {}, mouseX: 0, mouseY: 0, mouseDown: false
};

BA.canvasToView = function (clientX, clientY) {
  var r = BA.canvas.getBoundingClientRect();
  return {
    x: (clientX - r.left) * (BA.VIEW_W / r.width),
    y: (clientY - r.top) * (BA.VIEW_H / r.height)
  };
};

BA.onTouchStart = function (e) {
  e.preventDefault();
  if (BA.state !== "battle") { BA.tapToContinue(); return; }
  var i;
  for (i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    var p = BA.canvasToView(t.clientX, t.clientY);
    if (p.x < BA.VIEW_W / 2 && BA.input.moveId === null) {
      BA.input.moveId = t.identifier;
      BA.input.moveBase = p;
      BA.input.moveVec = { x: 0, y: 0 };
    } else if (BA.input.aimId === null) {
      BA.input.aimId = t.identifier;
      BA.input.aimBase = p;
      BA.input.aimVec = { x: 0, y: 0 };
      if (BA.battle) BA.battle.aiming = true;
    }
  }
};

BA.onTouchMove = function (e) {
  e.preventDefault();
  var i;
  for (i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    var p = BA.canvasToView(t.clientX, t.clientY);
    if (t.identifier === BA.input.moveId) {
      BA.input.moveVec = BA.limitStick(p.x - BA.input.moveBase.x, p.y - BA.input.moveBase.y);
    } else if (t.identifier === BA.input.aimId) {
      BA.input.aimVec = BA.limitStick(p.x - BA.input.aimBase.x, p.y - BA.input.aimBase.y);
      if (BA.battle && BA.battle.player && BA.input.aimVec.len > 10) {
        BA.battle.player.aimA = Math.atan2(BA.input.aimVec.y, BA.input.aimVec.x);
      }
    }
  }
};

BA.onTouchEnd = function (e) {
  e.preventDefault();
  var i;
  for (i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (t.identifier === BA.input.moveId) {
      BA.input.moveId = null;
      BA.input.moveVec = { x: 0, y: 0 };
    } else if (t.identifier === BA.input.aimId) {
      var v = BA.input.aimVec;
      BA.input.aimId = null;
      if (BA.battle && BA.battle.player) {
        if (v.len > 12) BA.battle.shoot(BA.battle.player, Math.atan2(v.y, v.x));
        else BA.battle.shoot(BA.battle.player, BA.battle.player.aimA);
      }
      if (BA.battle) BA.battle.aiming = false;
      BA.input.aimVec = { x: 0, y: 0 };
    }
  }
};

BA.limitStick = function (dx, dy) {
  var max = 40;
  var len = Math.sqrt(dx * dx + dy * dy);
  var k = len > max ? max / len : 1;
  return { x: dx * k, y: dy * k, len: len };
};

BA.tapToContinue = function () {
  if (BA.state === "menu") BA.startBattle();
  else if (BA.state === "over") BA.state = "menu";
};

// Мышь и клавиатура: для проверки на ПК, на телефоне не мешают
document.addEventListener("touchstart", BA.onTouchStart, false);
document.addEventListener("touchmove", BA.onTouchMove, false);
document.addEventListener("touchend", BA.onTouchEnd, false);
document.addEventListener("touchcancel", BA.onTouchEnd, false);

document.addEventListener("mousedown", function (e) {
  if (BA.state !== "battle") { BA.tapToContinue(); return; }
  BA.input.mouseDown = true;
  var p = BA.canvasToView(e.clientX, e.clientY);
  BA.input.mouseX = p.x; BA.input.mouseY = p.y;
});
document.addEventListener("mousemove", function (e) {
  var p = BA.canvasToView(e.clientX, e.clientY);
  BA.input.mouseX = p.x; BA.input.mouseY = p.y;
});
document.addEventListener("mouseup", function () { BA.input.mouseDown = false; });

window.addEventListener("keydown", function (e) {
  BA.input.keys[e.keyCode] = true;
  if (e.keyCode === 13 && BA.state !== "battle") BA.tapToContinue();
});
window.addEventListener("keyup", function (e) { BA.input.keys[e.keyCode] = false; });

/* ---------- Запуск боя ---------- */
BA.startBattle = function () {
  BA.battle = new BA.Battle(BA.arena);
  BA.state = "battle";
};

/* ---------- Цикл: фиксированный шаг 30 Гц ---------- */
BA.lastT = 0;
BA.acc = 0;

BA.frame = function (t) {
  var dt = (t - BA.lastT) / 1000;
  BA.lastT = t;
  if (dt > 0.25) dt = 0.25;
  if (dt > 0) BA.fps = BA.fps * 0.95 + (1 / dt) * 0.05;

  if (BA.state === "battle") {
    BA.acc += dt;
    var steps = 0;
    while (BA.acc >= BA.STEP && steps < 3) {
      BA.applyInput();
      BA.battle.update(BA.STEP);
      BA.acc -= BA.STEP;
      steps++;
      if (BA.battle.winner !== -1) { BA.state = "over"; break; }
    }
  }
  BA.render();
  BA.raf(BA.frame);
};

BA.applyInput = function () {
  var b = BA.battle;
  if (!b || !b.player) return;
  var p = b.player;
  if (!p.alive) { p.moveX = 0; p.moveY = 0; return; }

  var mx = BA.input.moveVec.x, my = BA.input.moveVec.y;
  var k = BA.input.keys;
  if (k[87] || k[38]) my -= 1;   // W / вверх
  if (k[83] || k[40]) my += 1;   // S / вниз
  if (k[65] || k[37]) mx -= 1;   // A / влево
  if (k[68] || k[39]) mx += 1;   // D / вправо
  p.moveX = mx; p.moveY = my;

  // прицел мышью
  if (!b.aiming || BA.input.aimVec.len <= 10) {
    var wx = BA.camX + BA.input.mouseX, wy = BA.camY + BA.input.mouseY;
    if (BA.input.mouseX || BA.input.mouseY) {
      p.aimA = Math.atan2(wy - p.y, wx - p.x);
    }
  }
  if (BA.input.mouseDown) b.shoot(p, p.aimA);
};

/* ---------- Отрисовка ---------- */
BA.camX = 0; BA.camY = 0;

BA.render = function () {
  var ctx = BA.ctx;
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, BA.VIEW_W, BA.VIEW_H);

  if (BA.state === "menu") { BA.drawMenu(ctx); return; }

  var b = BA.battle;
  var p = b.player;

  // камера следит за игроком (или местом смерти)
  var tx = BA.clamp(p.x - BA.VIEW_W / 2, 0, BA.WORLD_W - BA.VIEW_W);
  var ty = BA.clamp(p.y - BA.VIEW_H / 2, 0, BA.WORLD_H - BA.VIEW_H);
  BA.camX = Math.round(tx); BA.camY = Math.round(ty);
  var shake = b.shakeT > 0 ? 2 : 0;

  ctx.save();
  if (shake) ctx.translate(BA.rand(-shake, shake), BA.rand(-shake, shake));

  BA.arena.drawWorld(ctx, BA.camX, BA.camY, BA.VIEW_W, BA.VIEW_H);

  // гемы
  var i, e;
  for (i = 0; i < b.gems.length; i++) {
    var g = b.gems[i];
    BA.drawGem(ctx, g.x - BA.camX, g.y - BA.camY + Math.sin(b.time * 3 + i) * 2);
  }

  // бойцы: под кустами видно только своих и близких врагов
  for (i = 0; i < b.brawlers.length; i++) {
    e = b.brawlers[i];
    if (!e.alive) continue;
    var hidden = e.inBush && !e.isPlayer && e.team !== p.team && !b.canSee(p, e);
    if (hidden) continue;
    BA.drawBrawler(ctx, e);
  }

  // пули
  for (i = 0; i < b.bullets.length; i++) {
    var bl = b.bullets[i];
    ctx.fillStyle = BA.TEAM_COLOR[bl.team];
    ctx.beginPath();
    ctx.arc(bl.x - BA.camX, bl.y - BA.camY, BA.BRAWLER.bulletRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.stroke();
  }

  // кусты поверх
  BA.arena.drawBushes(ctx, BA.camX, BA.camY, BA.VIEW_W, BA.VIEW_H);
  // свой боец сквозь куст, если стоит в нём
  if (p.alive && p.inBush) BA.drawBrawler(ctx, p, 0.85);

  ctx.restore();
  BA.drawHud(ctx, b);
  if (BA.state === "over") BA.drawOver(ctx);
};

BA.drawBrawler = function (ctx, e, forceAlpha) {
  var ctx2 = ctx;
  var x = Math.round(e.x - BA.camX), y = Math.round(e.y - BA.camY);
  var alpha = forceAlpha !== undefined ? forceAlpha : 1;
  if (e.invT > 0 && Math.floor(e.invT * 10) % 2 === 0) alpha *= 0.4;

  ctx2.save();
  ctx2.globalAlpha = alpha;
  // тень (ctx.ellipse в iOS 6 нет — рисуем масштабированной окружностью)
  ctx2.save();
  ctx2.translate(x, y + 9);
  ctx2.scale(1, 0.5);
  ctx2.fillStyle = "rgba(0,0,0,0.25)";
  ctx2.beginPath();
  ctx2.arc(0, 0, 10, 0, Math.PI * 2);
  ctx2.fill();
  ctx2.restore();
  // «пушка»
  ctx2.fillStyle = "#37474f";
  ctx2.save();
  ctx2.translate(x, y);
  ctx2.rotate(e.aimA);
  ctx2.fillRect(2, -3, 16, 6);
  ctx2.restore();
  // тело
  ctx2.fillStyle = e.hitFlash > 0.5 ? "#ffffff" : BA.TEAM_COLOR[e.team];
  ctx2.beginPath();
  ctx2.arc(x, y, e.r, 0, Math.PI * 2);
  ctx2.fill();
  ctx2.lineWidth = 2;
  ctx2.strokeStyle = "rgba(0,0,0,0.5)";
  ctx2.stroke();
  // глаза-полоска, чтобы читался направление
  ctx2.fillStyle = "#ffffff";
  ctx2.fillRect(x + Math.cos(e.aimA) * 4 - 2, y + Math.sin(e.aimA) * 4 - 2, 4, 4);
  ctx2.restore();

  // полоса HP
  var w = 26, frac = BA.clamp(e.hp / e.maxHp, 0, 1);
  ctx2.fillStyle = "rgba(0,0,0,0.55)";
  ctx2.fillRect(x - w / 2 - 1, y - e.r - 10, w + 2, 5);
  ctx2.fillStyle = e.team === BA.TEAM_BLUE ? "#3aa0ff" : "#ff5a4e";
  ctx2.fillRect(x - w / 2, y - e.r - 9, Math.round(w * frac), 3);

  // патроны под своими
  if (e.isPlayer) {
    var i;
    for (i = 0; i < BA.BRAWLER.maxAmmo; i++) {
      ctx2.fillStyle = i < e.ammo ? "#ffd54f" : "rgba(255,255,255,0.25)";
      ctx2.fillRect(x - 15 + i * 11, y + e.r + 6, 9, 4);
    }
  }
};

BA.drawGem = function (ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#76ff03";
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.lineTo(-6, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#33691e";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
};

BA.drawStick = function (ctx, base, vec, color) {
  if (!base) return;
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(base.x, base.y, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(base.x + vec.x, base.y + vec.y, 14, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
};

BA.drawHud = function (ctx, b) {
  // счёт гемов
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(BA.VIEW_W / 2 - 64, 6, 128, 26);
  ctx.font = "bold 18px Helvetica, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = BA.TEAM_COLOR[BA.TEAM_BLUE];
  ctx.fillText(String(b.score[0]), BA.VIEW_W / 2 - 40, 20);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(":" + String(BA.GEMS_TO_WIN), BA.VIEW_W / 2, 20);
  ctx.fillStyle = BA.TEAM_COLOR[BA.TEAM_RED];
  ctx.fillText(String(b.score[1]), BA.VIEW_W / 2 + 40, 20);
  if (b.countdown > 0) {
    ctx.fillStyle = "#ffd54f";
    ctx.font = "bold 14px Helvetica, Arial";
    ctx.fillText(Math.ceil(b.countdown) + " с до победы!", BA.VIEW_W / 2, 42);
  }

  // джойстики
  if (BA.input.moveId !== null) BA.drawStick(ctx, BA.input.moveBase, BA.input.moveVec, "#ffffff");
  if (BA.input.aimId !== null) BA.drawStick(ctx, BA.input.aimBase, BA.input.aimVec, "#ffd54f");

  // возрождение
  var p = b.player;
  if (!p.alive) {
    ctx.fillStyle = "rgba(120,0,0,0.35)";
    ctx.fillRect(0, 0, BA.VIEW_W, BA.VIEW_H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px Helvetica, Arial";
    ctx.fillText("Возрождение: " + Math.ceil(p.respawnT) + " с", BA.VIEW_W / 2, BA.VIEW_H / 2);
  }

  if (BA.debug) {
    ctx.textAlign = "right";
    ctx.fillStyle = "#0f0";
    ctx.font = "10px Menlo, monospace";
    ctx.fillText("fps " + Math.round(BA.fps) + "  objs " + (b.bullets.length + b.gems.length), BA.VIEW_W - 4, 12);
    ctx.textAlign = "center";
  }
};

BA.drawMenu = function (ctx) {
  ctx.fillStyle = "#263238";
  ctx.fillRect(0, 0, BA.VIEW_W, BA.VIEW_H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffd54f";
  ctx.font = "bold 34px Helvetica, Arial";
  ctx.fillText("BRAWL ARENA", BA.VIEW_W / 2, BA.VIEW_H / 2 - 46);
  ctx.fillStyle = "#eceff1";
  ctx.font = "13px Helvetica, Arial";
  ctx.fillText("Захват гемов 3 на 3 · собери 10 и продержись 15 секунд", BA.VIEW_W / 2, BA.VIEW_H / 2 - 12);
  ctx.fillText("Слева — движение, справа — прицел: отпусти, чтобы выстрелить", BA.VIEW_W / 2, BA.VIEW_H / 2 + 10);
  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = "#8bc34a";
    ctx.font = "bold 16px Helvetica, Arial";
    ctx.fillText("Коснитесь, чтобы начать", BA.VIEW_W / 2, BA.VIEW_H / 2 + 52);
  }
};

BA.drawOver = function (ctx) {
  var b = BA.battle;
  var win = b.winner === BA.TEAM_BLUE;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, BA.VIEW_W, BA.VIEW_H);
  ctx.textAlign = "center";
  ctx.fillStyle = win ? "#8bc34a" : "#ff5a4e";
  ctx.font = "bold 32px Helvetica, Arial";
  ctx.fillText(win ? "Победа!" : "Поражение", BA.VIEW_W / 2, BA.VIEW_H / 2 - 20);
  ctx.fillStyle = "#eceff1";
  ctx.font = "14px Helvetica, Arial";
  ctx.fillText("Счёт " + b.score[0] + " : " + b.score[1], BA.VIEW_W / 2, BA.VIEW_H / 2 + 12);
  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillText("Коснитесь, чтобы сыграть снова", BA.VIEW_W / 2, BA.VIEW_H / 2 + 44);
  }
};

/* ---------- Поехали ---------- */
BA.fitScreen();
if (typeof window.__BA === "undefined") window.__BA = BA; // хук для автотестов

// iOS 6 знает rAF только с префиксом webkit и требует receiver'ом сам window
BA.raf = function (cb) {
  (window.requestAnimationFrame || window.webkitRequestAnimationFrame).call(window, cb);
};

// #battle — автозапуск боя: удалённая проверка FPS на устройстве
if (/#battle/.test(location.hash)) BA.startBattle();

// Телеметрия: только при раздаче по http. Игра сама сообщает FPS и ошибки —
// это единственный способ проверить A5 без скриншотов с устройства.
if (location.protocol === "http:") {
  window.onerror = function (msg, src, line) {
    try {
      (new Image()).src = "/err?m=" + encodeURIComponent(String(msg).slice(0, 120)) +
        "&l=" + line + "&r=" + Math.random();
    } catch (e) {}
    return false;
  };
  setInterval(function () {
    (new Image()).src = "/beat?state=" + BA.state +
      "&fps=" + Math.round(BA.fps) +
      "&alive=" + (BA.battle && BA.battle.player ? (BA.battle.player.alive ? 1 : 0) : "-") +
      "&t=" + Math.floor(Date.now() / 1000) + "&r=" + Math.random();
  }, 5000);
}

BA.raf(BA.frame);
