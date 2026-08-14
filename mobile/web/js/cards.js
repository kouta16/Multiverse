/* Multiverse card pool — superhero cards with images & rarity.
   Runs in the browser AND on the Node server. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CARD_POOL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function C(name, attack, intelligence, defense, img, rarity, special, bonus) {
    return { name: name, attack: attack, intelligence: intelligence, defense: defense, img: img, rarity: rarity, special: special, bonus: bonus };
  }
  var IMG = 'https://i.ibb.co/';
  var pool = [
    C('Batman', 650, 950, 500, IMG + 'bMy3m2MW/image.png', 'rare'),
    C('Thor', 1000, 500, 700, IMG + 'FkNPkKHQ/image.png', 'legendary'),
    C('Hulk', 950, 100, 700, IMG + 'gbZj0HJK/image.png', 'epic'),
    C('The Flash', 850, 350, 500, IMG + 'FPqHsZ5/image.png', 'common'),
    C('Wolverine', 750, 400, 500, IMG + 'wN4QTCJk/image.png', 'rare'),
    C('Robin', 250, 200, 150, IMG + 'j9SHJ1LC/image.png', 'common'),
    C('Green Lantern', 850, 750, 550, IMG + 'jPQD77wd/image.png', 'rare'),
    C('Deadpool', 300, 400, 350, IMG + '6crpdvHR/image.png', 'rare'),
    C('Aquaman', 700, 200, 450, IMG + 'hJdSpfHX/image.png', 'rare'),
    C('Captain America', 550, 700, 400, IMG + 'rRPMjzjJ/image.png', 'rare'),
    C('Black Panther', 650, 900, 500, IMG + 'DD6RG9pb/image.png', 'rare'),
    C('Green Arrow', 450, 400, 300, IMG + 'Y4Vpx3zd/image.png', 'common'),
    C('Iron Man', 700, 950, 550, IMG + 'zTvBny4c/image.png', 'epic'),
    C('Doctor Strange', 800, 850, 650, IMG + 'Zzgm8WbN/image.png', 'epic'),
    C('Dr. Fate', 750, 900, 400, IMG + 'NgD5qd5n/image.png', 'epic'),
    C('Spider-Man', 650, 800, 450, IMG + 'kgfmyx1F/image.png', 'common'),
    C('Daredevil', 400, 600, 300, IMG + 'TxxcGCB1/image.png', 'common'),
    C('The Punisher', 350, 400, 250, IMG + 'My5BVmm4/image.png', 'common'),
    C('The Thing', 750, 700, 400, IMG + 'Cs1NXpFf/image.png', 'epic'),
    C('Raven', 750, 700, 600, IMG + 'gZyZ1pYZ/image.png', 'rare'),
    C('Cyborg', 700, 800, 550, IMG + '1YV6CK8G/image.png', 'rare'),
    C('Scarlet Witch', 900, 500, 650, IMG + '5xMxpSqr/image.png', 'epic'),
    C('Superman', 1000, 450, 800, IMG + 'fYbkqZsp/image.png', 'legendary'),
    C('Shazam', 950, 100, 700, IMG + 'YFzsJhg8/image.png', 'epic'),
    C('Vision', 800, 850, 600, IMG + 'd05c1Pt5/image.png', 'epic'),
    C('Wonder Woman', 900, 500, 650, IMG + 'Xx7ySLs6/image.png', 'legendary'),
    C('Catwoman', 450, 400, 350, IMG + 'gMBz2fPM/image.png', 'common'),
    C('Magneto', 850, 600, 550, IMG + 'ZsyD7Z6/image.png', 'epic'),
    C('Martian Manhunter', 800, 600, 650, IMG + '4nN50VS6/image.png', 'epic'),
    C('Mr. Fantastic', 450, 1000, 200, IMG + '4Zynp7CD/image.png', 'epic'),
    C('Moon Knight', 650, 500, 350, IMG + 'DH06RLfG/image.png', 'rare'),
    C('Nightwing', 550, 500, 300, IMG + 'qM9T6vM8/image.png', 'rare'),
    C('Hawkman', 400, 300, 250, IMG + 'M5Scr8Nv/image.png', 'common'),
    C('Homelander', 1000, 150, 700, IMG + 'qKQQcyR/image.png', 'legendary'),
    C('Human Torch', 750, 300, 300, IMG + 'tpCzhp1m/image.png', 'rare'),
    C('Butcher', 400, 500, 300, IMG + 'ks90vMrY/image.png', 'common'),
    C('Captain Marvel', 900, 650, 700, IMG + '73G3QNr/image.png', 'legendary'),
    C('Booster Gold', 350, 250, 300, IMG + 'tW75vrq/image.png', 'common'),
    C('A-Train', 700, 200, 400, IMG + '1YpcgsB3/image.png', 'rare'),
    C('Soldier Boy', 800, 250, 600, IMG + 'mVvrKG94/image.png', 'epic'),
    C('Constantine', 300, 850, 200, IMG + 'Q7gvWXhH/image.png', 'rare'),
    C('Kimiko', 600, 150, 500, IMG + 'Rkss28fS/image.png', 'common'),
    C('Blue Beetle', 500, 650, 400, IMG + 'jvKb9vRD/image.png', 'rare'),
    C('Black Adam', 950, 300, 700, IMG + 's9BHMLby/image.png', 'legendary'),
    C('Invisible Woman', 450, 500, 350, IMG + 'FkFJy9qr/image.png', 'common'),
    C('Loki', 350, 400, 300, IMG + 'gZyZ1pYZ/image.png', 'legendary', 'steal'),
    C('Reverse Flash', 600, 300, 400, IMG + 'FPqHsZ5/image.png', 'legendary', 'swap'),
    C('Two-Face', 550, 500, 600, IMG + 'DH06RLfG/image.png', 'epic', 'twoface'),
    C('Hela', 950, 400, 800, IMG + 's9BHMLby/image.png', 'legendary', 'hela'),
    C('Kilgrave', 300, 600, 300, IMG + 'Q7gvWXHh/image.png', 'legendary', 'kilgrave'),
    C('Riddler', 350, 900, 350, IMG + 'NgD5qd5n/image.png', 'legendary', 'riddler'),
    C('Mr. Freeze', 750, 500, 600, IMG + 'Cs1NXpFf/image.png', 'legendary', 'mrfreeze'),
    C('Black Noir', 400, 500, 300, IMG + 'ZsyD7Z6/image.png', 'legendary', 'blacknoir'),
    C('Translucent', 500, 500, 500, IMG + 'FkFJy9qr/image.png', 'legendary', 'translucent'),
    C('+100', 100, 100, 100, IMG + 'bMy3m2MW/image.png', 'rare', null, 100),
    C('+200', 100, 100, 100, IMG + 'FkNPkKHQ/image.png', 'rare', null, 200),
    C('+300', 100, 100, 100, IMG + 'gbZj0HJK/image.png', 'epic', null, 300),
    C('+400', 100, 100, 100, IMG + 'zTvBny4c/image.png', 'epic', null, 400),
    C('+500', 100, 100, 100, IMG + 'fYbkqZsp/image.png', 'legendary', null, 500)
  ];
  // assign stable ids + specialty (strongest stat)
  pool.forEach(function (c, i) {
    c.id = 'c' + i;
    var best = 'attack';
    if (c.intelligence > c.attack && c.intelligence >= c.defense) best = 'intelligence';
    else if (c.defense > c.attack && c.defense > c.intelligence) best = 'defense';
    c.specialty = best;
  });
  // two copies of every SPECIAL card only (heroes and +bonuses stay single)
  var doubled = [];
  pool.forEach(function (c, i) {
    doubled.push(c);
    if (c.special) {
      var copy = {};
      for (var k in c) copy[k] = c[k];
      copy.id = 'd' + i;
      doubled.push(copy);
    }
  });
  return doubled;
});
