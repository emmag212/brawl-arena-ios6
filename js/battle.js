"use strict";
/* Brawl Arena — бой: бойцы, пули, гемы, боты, счёт. */

BA.Brawler = function (team, spawn, isPlayer, name) {
  this.team = team;
  this.spawn = spawn;
  this.isPlayer = !!isPlayer;
  this.name = name || (isPlayer ? "Вы" : "Бот");
  this.x = spawn.x;
  this.y = spawn.y;
  this.r = BA.BRAWLER.radius;
  this.maxHp = BA.BRAWLER.hp;
  this.hp = this.maxHp;
  this.ammo = BA.BRAWLER.maxAmmo;
  this.reloadT = 0;
  this.shootCd = 0;
  this.regenT = 0;
  this.alive = true;
  this.respawnT = 0;
  this.invT = 0;
  this.inBush = false;
  this.moveX = 0; this.moveY = 0;   // желаемое направление (-1..1)
  this.aimA = team === BA.TEAM_BLUE ? 0 : Math.PI;
  this.gems = 0;
  this.lastShotT = 999;
  this.hitFlash = 0;
  this.wobble = Math.random() * Math.PI * 2;
};

BA.Brawler.prototype.speed = function () {
  return BA.BRAWLER.speed;
};

BA.Battle = function (arena) {
  this.arena = arena;
  this.time = 0;
  this.gemTimer = BA.GEM_SPAWN_S * 0.6;   // первый гем быстрее
  this.bullets = [];
  this.gems = [];
  this.score = [0, 0];      // гемы у живых бойцов команды
  this.countdown = -1;      // >0 — тикает до победы команды-лидера
  this.winner = -1;         // -1 игра идёт, иначе индекс команды
  this.brawlers = [];
  this.shakeT = 0;
  this.buildTeams();
};

BA.Battle.prototype.buildTeams = function () {
  var a = this.arena;
  var i;
  for (i = 0; i < 3; i++) {
    this.brawlers.push(new BA.Brawler(
      BA.TEAM_BLUE, a.blueSpawns[i % a.blueSpawns.length], i === 0, i === 0 ? "Вы" : "Союзник"
    ));
    this.brawlers.push(new BA.Brawler(
      BA.TEAM_RED, a.redSpawns[i % a.redSpawns.length], false, "Противник"
    ));
  }
  this.player = this.brawlers[0];
};

BA.Battle.prototype.teamAliveGems = function (team) {
  var sum = 0, i;
  for (i = 0; i < this.brawlers.length; i++) {
    var b = this.brawlers[i];
    if (b.team === team && b.alive) sum += b.gems;
  }
  return sum;
};

BA.Battle.prototype.recountScore = function () {
  this.score[0] = this.teamAliveGems(BA.TEAM_BLUE);
  this.score[1] = this.teamAliveGems(BA.TEAM_RED);
  var lead = -1;
  if (this.score[0] >= BA.GEMS_TO_WIN) lead = BA.TEAM_BLUE;
  else if (this.score[1] >= BA.GEMS_TO_WIN) lead = BA.TEAM_RED;
  if (lead === -1) {
    this.countdown = -1;
  } else if (this.countdown < 0) {
    this.countdown = BA.COUNTDOWN_S;
  }
};

// Может ли b видеть e: кусты прячут, если не рядом
BA.Battle.prototype.canSee = function (b, e) {
  if (!e.alive) return false;
  if (e.inBush && BA.dist2(b.x, b.y, e.x, e.y) > 48 * 48) return false;
  return this.arena.hasLos(b.x, b.y, e.x, e.y);
};

BA.Battle.prototype.shoot = function (b, angle) {
  if (!b.alive || b.ammo <= 0 || b.shootCd > 0) return;
  b.ammo--;
  b.shootCd = 0.25;
  b.lastShotT = 0;
  var spec = BA.BRAWLER;
  var spread = (Math.random() - 0.5) * 0.06;
  this.bullets.push({
    x: b.x + Math.cos(angle) * (b.r + 4),
    y: b.y + Math.sin(angle) * (b.r + 4),
    vx: Math.cos(angle + spread) * spec.bulletSpeed,
    vy: Math.sin(angle + spread) * spec.bulletSpeed,
    team: b.team,
    owner: b,
    left: spec.range,
    dmg: spec.bulletDamage
  });
};

BA.Battle.prototype.update = function (dt) {
  this.time += dt;
  var i, j;
  this.shakeT = Math.max(0, this.shakeT - dt);

  // спавн гемов
  this.gemTimer -= dt;
  if (this.gemTimer <= 0 && this.gems.length < BA.GEMS_ON_FIELD_MAX) {
    this.gemTimer = BA.GEM_SPAWN_S;
    var spots = this.arena.gemSpawns;
    var spot = spots[BA.randInt(0, spots.length - 1)];
    this.gems.push({
      x: spot.x + BA.rand(-6, 6),
      y: spot.y + BA.rand(-6, 6),
      taken: false
    });
  }

  // бойцы
  for (i = 0; i < this.brawlers.length; i++) {
    var b = this.brawlers[i];
    b.lastShotT += dt;
    b.hitFlash = Math.max(0, b.hitFlash - dt * 4);
    if (!b.alive) {
      b.respawnT -= dt;
      if (b.respawnT <= 0) this.respawn(b);
      continue;
    }
    b.shootCd = Math.max(0, b.shootCd - dt);
    b.invT = Math.max(0, b.invT - dt);
    if (b.ammo < BA.BRAWLER.maxAmmo) {
      b.reloadT += dt;
      if (b.reloadT >= BA.BRAWLER.reloadS) {
        b.reloadT = 0;
        b.ammo++;
      }
    }
    // регенерация вне боя
    if (b.lastShotT > BA.REGEN_DELAY_S && b.hitFlash <= 0 && b.hp < b.maxHp) {
      b.hp = Math.min(b.maxHp, b.hp + 800 * dt);
    }
    b.inBush = this.arena.bushAtPx(b.x, b.y);

    if (!b.isPlayer) this.thinkBot(b, dt);

    // движение игрока и ботов уже задано в moveX/moveY
    var len = Math.sqrt(b.moveX * b.moveX + b.moveY * b.moveY);
    if (len > 1) { b.moveX /= len; b.moveY /= len; }
    var sp = b.speed() * dt;
    this.arena.moveCircle(b, b.moveX * sp, b.moveY * sp, b.r);
    if (len > 0.01) {
      var wantA = Math.atan2(b.moveY, b.moveX);
      // смотрит туда, куда идёт, если не целится (прицел у игрока задаётся отдельно)
      if (!b.isPlayer || !this.aiming) b.aimA += BA.angleDiff(b.aimA, wantA) * 0.3;
    }
  }

  // пули
  for (i = this.bullets.length - 1; i >= 0; i--) {
    var bl = this.bullets[i];
    var step = BA.BRAWLER.bulletSpeed * dt;
    bl.x += bl.vx * dt;
    bl.y += bl.vy * dt;
    bl.left -= step;
    var dead = bl.left <= 0 || this.arena.wallAtPx(bl.x, bl.y);
    if (!dead) {
      for (j = 0; j < this.brawlers.length; j++) {
        var t = this.brawlers[j];
        if (!t.alive || t.team === bl.team) continue;
        if (BA.dist2(bl.x, bl.y, t.x, t.y) < (t.r + BA.BRAWLER.bulletRadius) * (t.r + BA.BRAWLER.bulletRadius)) {
          if (t.invT <= 0) this.damage(t, bl.dmg, bl.owner);
          dead = true;
          break;
        }
      }
    }
    if (dead) this.bullets.splice(i, 1);
  }

  // гемы: подбор и счёт
  for (i = 0; i < this.gems.length; i++) {
    var gm = this.gems[i];
    if (gm.taken) continue;
    for (j = 0; j < this.brawlers.length; j++) {
      var p = this.brawlers[j];
      if (!p.alive) continue;
      if (BA.dist2(gm.x, gm.y, p.x, p.y) < 20 * 20) {
        gm.taken = true;
        p.gems++;
        break;
      }
    }
  }
  var alive = [];
  for (i = 0; i < this.gems.length; i++) if (!this.gems[i].taken) alive.push(this.gems[i]);
  this.gems = alive;

  this.recountScore();

  // обратный отсчёт до победы
  if (this.countdown > 0) {
    this.countdown -= dt;
    var lead = this.score[0] >= BA.GEMS_TO_WIN ? BA.TEAM_BLUE : BA.TEAM_RED;
    if (this.score[lead] < BA.GEMS_TO_WIN) this.countdown = -1; // лидер потерял гемы
    else if (this.countdown <= 0) this.winner = lead;
  }
};

BA.Battle.prototype.damage = function (target, dmg, attacker) {
  target.hp -= dmg;
  target.hitFlash = 1;
  if (attacker && attacker.isPlayer) this.shakeT = 0.08;
  if (target.hp <= 0) {
    target.alive = false;
    target.hp = 0;
    target.respawnT = BA.RESPAWN_S;
    // роняем все гемы вокруг
    var k;
    for (k = 0; k < target.gems; k++) {
      var a = Math.random() * Math.PI * 2;
      var rr = BA.rand(6, 22);
      var gx = BA.clamp(target.x + Math.cos(a) * rr, 40, BA.WORLD_W - 40);
      var gy = BA.clamp(target.y + Math.sin(a) * rr, 40, BA.WORLD_H - 40);
      if (this.arena.wallAtPx(gx, gy)) { gx = target.x; gy = target.y; }
      this.gems.push({ x: gx, y: gy, taken: false });
    }
    target.gems = 0;
  }
};

BA.Battle.prototype.respawn = function (b) {
  b.alive = true;
  b.hp = b.maxHp;
  b.ammo = BA.BRAWLER.maxAmmo;
  b.reloadT = 0;
  b.shootCd = 0;
  b.invT = BA.INVULN_S;
  b.x = b.spawn.x;
  b.y = b.spawn.y;
};

BA.Battle.prototype.recheckVisibility = function () {
  // игрок видит врага в кустах, только если близко; хранить нечего — рендер сам спросит canSee
};

/* ---------------- Бот ----------------
  Простые правила: собирать гемы, стрелять по тому, кого видно,
  отступать на низком HP, не толкаться в стены.
*/
BA.Battle.prototype.thinkBot = function (b, dt) {
  var a = this.arena;
  var i, best;

  // цель-гем: ближайший свободный
  best = null;
  var bestD = Infinity;
  for (i = 0; i < this.gems.length; i++) {
    var gm = this.gems[i];
    var d = BA.dist2(b.x, b.y, gm.x, gm.y);
    if (d < bestD) { bestD = d; best = gm; }
  }

  // цель-враг: ближайший видимый
  var enemy = null, enemyD = Infinity;
  for (i = 0; i < this.brawlers.length; i++) {
    var e = this.brawlers[i];
    if (e.team === b.team || !e.alive) continue;
    var d2 = BA.dist2(b.x, b.y, e.x, e.y);
    if (d2 < enemyD && this.canSee(b, e)) { enemyD = d2; enemy = e; }
  }

  var lowHp = b.hp < b.maxHp * 0.3;
  var wantX = 0, wantY = 0;

  if (lowHp) {
    // домой
    var hx = b.spawn.x - b.x, hy = b.spawn.y - b.y;
    var hn = BA.norm(hx, hy);
    wantX = hn.x; wantY = hn.y;
  } else if (best) {
    var gn = BA.norm(best.x - b.x, best.y - b.y);
    wantX = gn.x; wantY = gn.y;
  } else {
    // к центру карты
    var cn = BA.norm(BA.WORLD_W / 2 - b.x, BA.WORLD_H / 2 - b.y);
    wantX = cn.x * 0.6; wantY = cn.y * 0.6;
  }

  // держать дистанцию боя: враг слишком близко — назад, далеко — вперёд
  if (enemy) {
    var ed = Math.sqrt(enemyD);
    var away = BA.norm(b.x - enemy.x, b.y - enemy.y);
    if (ed < 90) { wantX += away.x * 1.2; wantY += away.y * 1.2; }
    else if (ed > BA.BRAWLER.range * 0.8) { wantX -= away.x * 0.5; wantY -= away.y * 0.5; }
    // стрелять с упреждением
    var lead = ed / BA.BRAWLER.bulletSpeed;
    var tx = enemy.x + enemy.moveX * BA.BRAWLER.speed * lead * 0.8;
    var ty = enemy.y + enemy.moveY * BA.BRAWLER.speed * lead * 0.8;
    var aim = Math.atan2(ty - b.y, tx - b.x) + BA.rand(-0.12, 0.12);
    b.aimA += BA.angleDiff(b.aimA, aim) * 0.5;
    if (ed < BA.BRAWLER.range && b.ammo > 0 && b.shootCd <= 0 && Math.random() < 0.9) {
      this.shoot(b, b.aimA);
    }
  } else {
    b.aimA += BA.angleDiff(b.aimA, Math.atan2(wantY, wantX)) * 0.2;
  }

  // обход стен: если впереди стена, пробуем повернуть на +/-60°
  var nx = b.x + wantX * 20, ny = b.y + wantY * 20;
  if (a.wallAtPx(nx, ny) || !a.circleFits(nx, ny, b.r)) {
    var base = Math.atan2(wantY, wantX);
    var tries = [0.9, -0.9, 1.6, -1.6, 2.4, -2.4];
    for (i = 0; i < tries.length; i++) {
      var cx = b.x + Math.cos(base + tries[i]) * 20;
      var cy = b.y + Math.sin(base + tries[i]) * 20;
      if (!a.wallAtPx(cx, cy) && a.circleFits(cx, cy, b.r)) {
        base += tries[i];
        break;
      }
    }
    wantX = Math.cos(base); wantY = Math.sin(base);
  }

  b.moveX = wantX; b.moveY = wantY;
};
