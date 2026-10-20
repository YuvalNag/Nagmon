"""HD pictures: nothing is shown above 2x its pixels (SDD §10, "תמונות")."""

import io
import json
from fnmatch import fnmatch

import numpy as np
import pytest
from PIL import Image

from tools.app import hd
from tools.app.common import OUT, REPO, palette_image, png_bytes

# ------------------------------------------------------------ the phone
#: Galaxy-class phone, landscape: 2400x1080 device px, 2.75 per CSS px.
SCREEN = (2400, 1080)
DPR = 2.75
#: Device px for one pixel of 1x art, where each kind is shown.
#: The battle: a 64 px monster frame is 384 device px tall (140 CSS px,
#: 36% of the screen). The Nagmon monsters are drawn at ~190 px, so
#: 2 x 192 is the most any battle can show without enlarging them more.
BATTLE = 6.0
#: The map: a 16 px tile is 112 device px (the old game's phone scale
#: 7; 9.6 tiles on the screen's height).
MAP = 7.0
#: A 24 px icon in a 48 dp button: 132 device px.
ICON = 48 * DPR / 24
#: A 256x108 battle background covers the whole screen.
BACKGROUND = max(SCREEN[0] / 256, SCREEN[1] / 108)
#: The who-plays card picture: 26vh (styles.css ".card img").
CARD_PX = 0.26 * SCREEN[1]
#: The rule.
MAX_ENLARGEMENT = 2.0


def data(built, rel):
    out, _ = built
    return json.loads(out.data[rel])


def image(built, rel):
    out, _ = built
    if rel in out.images:
        return out.images[rel]
    return Image.open(out.copies[rel])


def scales(built):
    """Shipped picture -> its scale (picture px per 1x px) from records."""
    found = {}
    for m in data(built, "db/monsters.json").values():
        found[m["sprites"]["sheet"]] = m["sprites"]["scale"]
    npcs = data(built, "db/npcs.json").values()
    avatars = data(built, "db/avatars.json")["avatars"]
    for art in [n["sprites"] for n in npcs] + avatars:
        for sheet in [art, *art.get("alternates", {}).values()]:
            if sheet.get("map"):
                found[sheet["map"]] = sheet["scale"]
        if art.get("portrait"):
            found[art["portrait"]] = art["portrait_scale"]
    for item in data(built, "db/items.json").values():
        if item.get("sprite"):
            found[item["sprite"]] = item["sprite_scale"]
    for el in data(built, "db/elements.json").values():
        if el.get("icon"):
            found[el["icon"]] = el["icon_scale"]
    for anim in data(built, "db/animations.json").values():
        found[anim["sheet"]] = anim["scale"]
    for env in data(built, "db/environments.json").values():
        graphics = env["battle_graphics"]

        def walk(node):
            if isinstance(node, dict):
                for v in node.values():
                    walk(v)
            elif isinstance(node, str) and node.endswith(".png"):
                found[node] = graphics["scale"]

        walk(graphics)
    return found


def by_scale(per_1x_px):
    """Enlargement of a picture whose records give its scale."""
    return lambda built, rel, im: per_1x_px / scales(built)[rel]


def monster(built, rel, im):
    k = scales(built)[rel]
    return max(BATTLE / k, ICON / k)


def atlas(built, rel, im):
    name = rel.removeprefix("atlas/").removesuffix(".png")
    doc = data(built, f"maps/{name}.json")
    props = {p["name"]: p["value"] for p in doc["properties"]}
    return MAP * props["source_tile_size"] / doc["tilewidth"]


def portrait(built, rel, im):
    # In battle (the trainer) at BATTLE; dialogs show half of that.
    return BATTLE / scales(built)[rel]


def card(built, rel, im):
    return CARD_PX / im.height


#: Where every shipped picture is shown: (path pattern, what, the
#: enlargement on the phone). The first matching row wins.
DISPLAY = [
    ("sprites/monsters/*", "battle front/back, menu icon", monster),
    ("atlas/*.png", "map tiles", atlas),
    ("sprites/npc/*", "map characters", by_scale(MAP)),
    ("sprites/objects/*", "map props", by_scale(MAP)),
    ("sprites/portraits/*", "battle trainer, dialog", portrait),
    ("avatars/*", "who-plays card", card),
    ("sprites/items/*", "bag icon", by_scale(ICON)),
    ("sprites/ui/element/*", "type icon", by_scale(ICON)),
    ("sprites/animations/tileset/*", "map animation", by_scale(MAP)),
    ("sprites/animations/*", "battle animation", by_scale(BATTLE)),
    ("sprites/ui/*background*", "battle background", by_scale(BACKGROUND)),
    (
        "sprites/ui/battle_interior.png",
        "battle background",
        by_scale(BACKGROUND),
    ),
    ("sprites/ui/*", "battle HUD, trays, islands", by_scale(BATTLE)),
]


def pictures(built):
    out, _ = built
    return sorted(
        p
        for p in out.paths()
        if p.endswith((".png", ".jpg", ".jpeg", ".webp"))
    )


def test_no_shipped_picture_is_shown_above_twice_its_pixels(built):
    too_big = []
    for rel in pictures(built):
        row = next((r for r in DISPLAY if fnmatch(rel, r[0])), None)
        assert row is not None, f"{rel}: not in the display table"
        ratio = row[2](built, rel, image(built, rel))
        if ratio > MAX_ENLARGEMENT + 1e-9:
            too_big.append(f"{rel} ({row[1]}): x{ratio:.2f}")
    assert not too_big, "\n".join(too_big)


def test_every_monster_sheet_is_at_the_hd_scale(built):
    for slug, m in data(built, "db/monsters.json").items():
        sp = m["sprites"]
        assert sp["scale"] == hd.MONSTER, slug
        im = image(built, sp["sheet"])
        assert im.size == (128 * sp["scale"], 88 * sp["scale"]), slug


def test_monster_rects_match_the_sheet(built):
    for slug, m in data(built, "db/monsters.json").items():
        sp, k = m["sprites"], m["sprites"]["scale"]
        assert sp["front"] == [0, 0, 64 * k, 64 * k], slug
        assert sp["back"] == [64 * k, 0, 64 * k, 64 * k], slug
        assert sp["menu1"] == [0, 64 * k, 24 * k, 24 * k], slug
        assert sp["menu2"] == [24 * k, 64 * k, 24 * k, 24 * k], slug
        im = image(built, sp["sheet"])
        for name in ("front", "back"):
            x, y, w, h = sp[name]
            assert im.crop((x, y, x + w, y + h)).getbbox(), (slug, name)


def test_map_frames_match_their_pictures(built):
    npcs = data(built, "db/npcs.json")
    avatars = data(built, "db/avatars.json")["avatars"]
    for art in [n["sprites"] for n in npcs.values()] + avatars:
        for sheet in [art, *art.get("alternates", {}).values()]:
            if not sheet.get("map"):
                continue
            w, h = sheet["frame"]
            im = image(built, sheet["map"])
            static = sheet["map"].startswith("sprites/objects/")
            assert im.size == ((w, h) if static else (3 * w, 4 * h))
            if not static:
                # a character is 16x32 at 1x
                assert (w, h) == (16 * sheet["scale"], 32 * sheet["scale"])


def test_animation_frames_match_their_sheets(built):
    for slug, a in data(built, "db/animations.json").items():
        im = image(built, a["sheet"])
        fx, fy, cols, n = a["frame_x"], a["frame_y"], a["columns"], a["frames"]
        rows = -(-n // cols)
        assert cols * fx <= im.width and rows * fy <= im.height, slug
        assert max(im.size) <= hd.MAX_TEXTURE, slug
        assert fx % a["scale"] == 0 and fy % a["scale"] == 0, slug


def test_islands_say_their_frame_size(built):
    for slug, env in data(built, "db/environments.json").items():
        g = env["battle_graphics"]
        im = image(built, g["island_sheet"])
        assert im.size == (2 * g["island_width"], g["island_height"]), slug


def test_no_picture_is_wider_than_a_texture(built):
    for rel in pictures(built):
        assert max(image(built, rel).size) <= hd.MAX_TEXTURE, rel


def test_credits_mark_every_upscaled_picture_as_adapted(built):
    out, _ = built
    doc = data(built, "credits.json")
    upscaled = [a for a in out.assets.values() if a.adapted]
    assert len(upscaled) > 100
    listed = {a["path"]: a for a in doc["assets"]}
    for asset in upscaled:
        k = int(asset.adapted.removeprefix("xBRZ x"))
        assert f"adapted (xBRZ x{k})" in listed[asset.path]["licence"]
        assert "tools/app/hd.py" in listed[asset.path]["note"]
        with Image.open(REPO / asset.sources[0]) as src:
            # (a long animation strip may be wrapped into rows)
            assert image(built, asset.path).height % (src.height * k) == 0


def _frames(built):
    """(picture, box) of every frame whose sheet the build upscaled."""
    for m in data(built, "db/monsters.json").values():
        sp = m["sprites"]
        for name in ("front", "back", "menu1", "menu2"):
            x, y, w, h = sp[name]
            yield sp["sheet"], (x, y, x + w, y + h)
    for rel, k in scales(built).items():
        if rel.startswith(("sprites/items/", "sprites/ui/element/")):
            yield rel, None


def test_upscaled_edges_carry_the_art_colour_not_black(built):
    """
    The alpha bleed: a clear pixel just left of the art has a colour
    (black only next to black art), so smooth scaling adds no halo.
    """
    out, _ = built
    for rel, box in _frames(built):
        if not out.assets[rel].adapted:
            continue
        im = image(built, rel).convert("RGBA")
        rgba = np.array(im.crop(box) if box else im).astype(int)
        seen = np.pad(rgba[..., 3] > 0, 1)
        dark = np.pad(rgba[..., :3].sum(-1) == 0, 1)
        # the four neighbours of each pixel: art, and dark art
        near = [
            (slice(1, -1), slice(None, -2)),
            (slice(1, -1), slice(2, None)),
            (slice(None, -2), slice(1, -1)),
            (slice(2, None), slice(1, -1)),
        ]
        art = np.any([seen[n] for n in near], axis=0)
        dark_art = np.any([seen[n] & dark[n] for n in near], axis=0)
        inner = (slice(1, -1), slice(1, -1))
        halo = ~seen[inner] & dark[inner] & art & ~dark_art
        assert not halo.any(), rel


# ------------------------------------------------------------ the tools


def test_xbrz_scales_each_frame_on_its_own():
    strip = Image.new("RGBA", (8, 4), (0, 0, 0, 0))
    for x in range(4):
        for y in range(4):
            strip.putpixel((x, y), (200, 30, 30, 255))
    out = hd.xbrz(strip, 4, hd.grid(8, 4, 4, 4))
    assert out.size == (32, 16)
    a = np.array(out)
    # the full frame stays a full square: its cut edges are not rounded
    assert (a[:, :16, 3] == 255).all()
    # and nothing of it leaks into the empty frame next to it
    assert (a[:, 16:, 3] == 0).all()


def test_xbrz_smooths_a_diagonal():
    im = Image.new("RGBA", (6, 6), (0, 0, 0, 0))
    for i in range(6):
        for j in range(i + 1):
            im.putpixel((j, i), (0, 0, 255, 255))
    a = np.array(hd.xbrz(im, 3))
    assert a.shape == (18, 18, 4)
    # xBRZ adds soft steps along the diagonal (nearest would not)
    assert len(np.unique(a[..., 3])) > 2


def test_wrap_keeps_frames_in_order():
    strip = Image.new("RGBA", (5 * 1000, 10))
    for i in range(5):
        strip.paste((i * 40, 0, 0, 255), (i * 1000, 0, (i + 1) * 1000, 10))
    sheet, columns = hd.wrap(strip, 1000, 10, 5)
    assert columns == 4 and sheet.size == (4000, 20)
    assert sheet.getpixel((0, 10)) == (160, 0, 0, 255)
    same, columns = hd.wrap(strip.crop((0, 0, 3000, 10)), 1000, 10, 3)
    assert columns == 3 and same.size == (3000, 10)


@pytest.mark.parametrize("colours", [3, 256, 300])
def test_png_bytes_are_lossless(colours):
    rng = np.random.default_rng(colours)
    palette = rng.integers(0, 256, (colours, 4), dtype=np.uint8)
    palette[0] = 0
    pixels = palette[rng.integers(0, colours, (20, 20))]
    pixels[0, : min(colours, 20)] = palette[: min(colours, 20)]
    im = Image.fromarray(pixels, "RGBA")
    back = Image.open(io.BytesIO(png_bytes(im)))
    assert back.convert("RGBA").tobytes() == im.tobytes()
    assert (palette_image(im) is None) == (
        len(np.unique(pixels.reshape(-1, 4), axis=0)) > 256
    )


def test_committed_pictures_are_stored_compactly():
    """A small upscaled sheet ships as a palette PNG."""
    with Image.open(OUT / "sprites/animations/technique/bite.png") as im:
        assert im.mode == "P"
