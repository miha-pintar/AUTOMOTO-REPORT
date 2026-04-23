#!/usr/bin/env python3
import csv
import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET


MEDIA_PREFIX = "https://cdn.epidemic.co/media/"

POST_FILES = {
    "GA Adriatic": "GA Adriatic Posts 23_04_2026",
    "Peugeot Slovenija": "Peugeot Posts 23_04_2026.csv",
    "Škoda Slovenija": "Skoda Posts 23_04_2026.csv",
    "Toyota Slovenija": "Toyota Posts 23_04_2026.csv",
    "Volkswagen Slovenija": "Volkswagen Posts 23_04_2026.csv",
}

COMMENT_FILES = {
    "GA Adriatic": [
        "GA Adriatic Dacia Comments 23_04_2026.xlsx",
        "GA Adriatic renault Comments 23_04_2026.xlsx",
    ],
    "Peugeot Slovenija": ["Peugeot comments 23_04_2026.xlsx"],
    "Škoda Slovenija": ["Skoda comments 23_04_2026.xlsx"],
    "Toyota Slovenija": ["Toyota comments 23_04_2026.xlsx"],
    "Volkswagen Slovenija": ["Volkswagen comments 23_04_2026.xlsx"],
}

THEME_RULES = [
    ("Product launches", ["novi", "nova", "predstav", "premier", "launch", "prvič", "najnov", "slovenski avto leta"]),
    ("Test drives", ["test", "vozili", "preizkus", "volan", "vožnj", "testirali", "testna"]),
    ("Promotions", ["ugod", "popust", "akcij", "ponud", "financ", "nagrad", "osvoji", "cene"]),
    ("Lifestyle", ["potov", "vikend", "družin", "življenj", "izlet", "avantur", "vanlife", "slog"]),
    ("Sustainability", ["elektr", "hibrid", "e-tech", "ev", "plug-in", "brez emis", "trajnost"]),
    ("Brand storytelling", ["zgodba", "intervju", "podkast", "sovoznik", "tradic", "znamk"]),
]

POSITIVE_WORDS = [
    "super",
    "odli",
    "top",
    "bravo",
    "lep",
    "lepa",
    "najbol",
    "všeč",
    "hud",
    "hudo",
    "perfekt",
    "kras",
    "čudovit",
    "dober",
    "fajn",
    "zmaga",
    "navdu",
    "komaj čakam",
    "komaj cakam",
    "takoj bi ga imel",
    "mindblowing",
    "love",
    "😍",
    "🤩",
    "🔥",
    "👏",
    "🙌",
    "❤️",
]

NEGATIVE_WORDS = [
    "slab",
    "groz",
    "drag",
    "predrag",
    "napaka",
    "problem",
    "ne maram",
    "grd",
    "škoda",
    "zanič",
    "katastro",
    "preveč",
    "ni mi",
    "nikoli",
    "manjka",
    "skret",
    "mimo",
    "nateg",
    "glupo",
    "debilno",
    "zabloda",
    "oslep",
    "zaslep",
]

STRONG_POSITIVE_PATTERNS = [
    (r"super avto", 4),
    (r"\bhud je\b", 3),
    (r"\bhudo\b", 2),
    (r"\btop\b", 2),
    (r"\bbravo\b", 2),
    (r"\bčudovit\b", 3),
    (r"\bkomaj cakam\b|\bkomaj čakam\b", 3),
    (r"\btakoj bi ga imel\b", 5),
    (r"\bizredno presene", 3),
    (r"\bzmaga\b", 2),
    (r"\bmindblowing\b", 3),
    (r"\bto je prihodnost\b", 3),
    (r"\btole mora postat stalnica\b", 4),
    (r"\bkok dobr\b|\bkako dobr\b", 3),
    (r"\brumen\b", 2),
    (r"🔥|😍|🤩|🙌|❤️|❤|♥", 1),
]

STRONG_NEGATIVE_PATTERNS = [
    (r"\bdelate norca\b", 5),
    (r"\bzopet manjka\b|\bspet manjka\b", 4),
    (r"\bmanjka\b", 1),
    (r"\b10k predrag\b", 5),
    (r"\bpredrag\b", 4),
    (r"\bpreveč\b.*\bdrag", 4),
    (r"\bskret\b", 6),
    (r"\bkoj grd\b|\bkako grd\b", 5),
    (r"\bgrd\b", 3),
    (r"\bkaj je s temi\b", 3),
    (r"\bmalo mimo\b", 3),
    (r"\bneka hvala\b", 4),
    (r"\bne bo nikoli\b", 4),
    (r"\bzabloda\b", 5),
    (r"\bnateg\b", 6),
    (r"\bglupo\b", 5),
    (r"\bdebilno\b", 6),
    (r"\boslepijo\b|\bzaslepi\b", 4),
    (r"\bza časom\b|\bza casom\b", 3),
]

NEGATIVE_OVERRIDE_PATTERNS = [
    r"\bpredrag\b|\bdrag\b",
    r"\bcena\b.*\bhi(s|š)o\b|\bmalo hi(s|š)o\b",
    r"\bdelate norca\b",
    r"\bskret\b",
    r"\bgrd\b",
    r"\bnateg\b",
    r"\bglupo\b",
    r"\bdebilno\b",
    r"\bzabloda\b",
    r"\boslepijo\b|\bzaslepi\b",
]

QUESTION_PATTERNS = [
    r"\ba je\b",
    r"\bali\b",
    r"\bkaj\b",
    r"\bkako\b",
    r"\bkoliko\b",
    r"\bvprasanje\b|\bvprašanje\b",
    r"\bzanima\b",
    r"\bje opcija\b",
    r"\bv čem\b|\bv cem\b",
]

CONSTRUCTIVE_PATTERNS = [
    r"\bdober bi bilo\b|\bdobro bi bilo\b",
    r"\bobjavite\b",
    r"\btrasa\b",
    r"\bpodatke\b",
    r"\bvreme\b",
    r"\btemperaturo\b",
    r"\bna koliko časa\b|\bna koliko casa\b",
    r"\bpregledat\b",
    r"\bpotrebno\b",
    r"\bzdržijo\b|\bzdrzijo\b",
    r"\bvlečne sile\b|\bvlecne sile\b",
    r"\bmotorje\b",
    r"\bpogon\b",
    r"\bporaba\b",
]

AMBIGUOUS_PATTERNS = [
    r"\buh\b.*\bno comment\b",
]

PERSON_FOCUSED_PATTERNS = [
    r"\bfaca vedno\b",
    r"\bbravo det\b",
]

SOFT_NEUTRAL_PATTERNS = [
    r"\bmanjka samo še\b|\bmanjka samo se\b",
]

FEATURE_TERMS = [
    "luči",
    "luci",
    "žaromet",
    "zaromet",
    "ekran",
    "poraba",
    "trasa",
    "pogon",
    "motor",
    "hibrid",
    "vodik",
    "elektr",
    "tlačne posode",
    "tlacne posode",
    "vlečne sile",
    "vlecne sile",
]


def norm(value):
    return str(value or "").strip()


def row_value(row, *keys):
    normalized = {
        norm(key).lower().replace("_", " "): value
        for key, value in row.items()
    }
    for key in keys:
        value = normalized.get(norm(key).lower().replace("_", " "))
        if norm(value):
            return value
    return ""


def number(value):
    value = norm(value).replace(".", "").replace(",", ".") if isinstance(value, str) and "," in value else norm(value)
    try:
        return float(value)
    except ValueError:
        return 0.0


def intish(value):
    return int(round(number(value)))


def read_csv(path):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def parse_post_date(value):
    raw = norm(value)
    if not raw:
        return None

    if re.fullmatch(r"\d+(?:\.\d+)?", raw):
        serial = float(raw)
        if 20000 <= serial <= 60000:
            return (datetime(1899, 12, 30) + timedelta(days=serial)).date()

    iso_match = re.search(r"\d{4}-\d{1,2}-\d{1,2}", raw)
    if iso_match:
        try:
            return datetime.strptime(iso_match.group(0), "%Y-%m-%d").date()
        except ValueError:
            return None

    european_match = re.search(r"\d{1,2}[./]\d{1,2}[./]\d{2,4}", raw)
    if european_match:
        candidate = european_match.group(0)
        separator = "." if "." in candidate else "/"
        day, month, year = candidate.split(separator)
        if len(year) == 2:
            year = f"20{year}"
        for day_value, month_value in ((day, month), (month, day)):
            try:
                return datetime(int(year), int(month_value), int(day_value)).date()
            except ValueError:
                continue

    for pattern in ("%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(raw, pattern).date()
        except ValueError:
            continue

    return None


def post_date(row):
    return parse_post_date(
        row_value(
            row,
            "date",
            "publication date",
            "publication_date",
            "published_at",
            "published at",
            "created_time",
            "created time",
            "timestamp",
            "time",
        )
    )


def date_range_from_posts(rows):
    dates = [date for date in (post_date(row) for row in rows) if date]
    if not dates:
        return None
    return min(dates), max(dates)


def media_identifier(row):
    src = norm(row.get("src"))
    if not src:
        return ""
    return Path(src).stem


def row_signature(row):
    return (
        norm(row_value(row, "date", "publication date", "publication_date", "published_at", "published at")),
        media_identifier(row),
        str(row.get("content_caption") or ""),
    )


def interaction_signature(row):
    return (
        norm(row.get("likes")),
        norm(row.get("comments")),
        norm(row.get("engagement")),
    )


def is_feed_post(row):
    return norm(row.get("type")).lower() == "post"


def is_reel(row):
    return norm(row.get("src")).lower().endswith(".mp4") or "reel" in norm(row.get("type")).lower()


def is_exported_reel(row):
    return "reel" in norm(row.get("type")).lower()


def remove_feed_post_reel_duplicates(rows):
    reel_signatures = {
        (row_signature(row), interaction_signature(row))
        for row in rows
        if is_exported_reel(row)
    }
    clean_rows = []
    removed = 0
    for row in rows:
        if is_feed_post(row) and (row_signature(row), interaction_signature(row)) in reel_signatures:
            removed += 1
            continue
        clean_rows.append(row)
    return clean_rows, removed


def xlsx_shared_strings(zf):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    strings = []
    for item in root.findall("a:si", ns):
        text = "".join(node.text or "" for node in item.findall(".//a:t", ns))
        strings.append(text)
    return strings


def read_xlsx(path):
    with zipfile.ZipFile(path) as zf:
        shared = xlsx_shared_strings(zf)
        sheet_names = sorted(name for name in zf.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml", name))
        if not sheet_names:
            return []
        root = ET.fromstring(zf.read(sheet_names[0]))
    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    rows = []
    for row in root.findall(".//a:sheetData/a:row", ns):
        values = []
        expected_col = 0
        for cell in row.findall("a:c", ns):
            ref = cell.attrib.get("r", "")
            col_letters = re.sub(r"\d", "", ref)
            col_index = 0
            for char in col_letters:
                col_index = col_index * 26 + ord(char.upper()) - 64
            col_index -= 1
            while expected_col < col_index:
                values.append("")
                expected_col += 1
            raw = cell.find("a:v", ns)
            inline = cell.find("a:is/a:t", ns)
            if inline is not None:
                value = inline.text or ""
            elif raw is None:
                value = ""
            elif cell.attrib.get("t") == "s":
                value = shared[int(raw.text)]
            else:
                value = raw.text or ""
            values.append(value)
            expected_col += 1
        rows.append(values)
    if not rows:
        return []
    header = [norm(value).lower() for value in rows[0]]
    return [dict(zip(header, row)) for row in rows[1:] if any(norm(value) for value in row)]


def load_model_terms(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    terms = []
    for brand in data["brands"]:
        brand_terms = [brand["brand"], *brand.get("brandAliases", [])]
        for model in brand["models"]:
            aliases = [model["name"], *model.get("aliases", [])]
            aliases.extend(f"{model['name']} {variant}" for variant in model.get("variants", []))
            for alias in aliases:
                clean = norm(alias)
                if clean:
                    terms.append((model["name"], clean.lower()))
            short = model["name"].replace(brand["brand"], "").strip()
            if short and len(short) > 2:
                terms.append((model["name"], short.lower()))
        for alias in brand_terms:
            clean = norm(alias)
            if clean:
                terms.append((brand["brand"], clean.lower()))
    terms.sort(key=lambda item: len(item[1]), reverse=True)
    return terms


def detect_models(text, model_terms, allowed_brands):
    haystack = text.lower()
    found = []
    for model, term in model_terms:
        if not any(model.lower().startswith(brand.lower()) for brand in allowed_brands):
            continue
        pattern = r"(?<![\w])" + re.escape(term).replace(r"\ ", r"[\s#_-]+") + r"(?![\w])"
        if re.search(pattern, haystack, flags=re.IGNORECASE):
            found.append(model)
    unique = []
    for item in found:
        if item not in unique:
            unique.append(item)
    return unique


def detect_theme(text):
    haystack = text.lower()
    scores = Counter()
    for theme, terms in THEME_RULES:
        for term in terms:
            if term in haystack:
                scores[theme] += 1
    if scores:
        return scores.most_common(1)[0][0]
    return "Lifestyle"


def media_type(row):
    content_type = norm(row.get("type")).lower()
    src = norm(row.get("src")).lower()
    if "story" in content_type:
        return "Story"
    if src.endswith(".mp4") or "reel" in content_type or "video" in content_type:
        return "Reel"
    return "Photo"


def compact(value):
    value = float(value)
    if value >= 1000000:
        return f"{value / 1000000:.1f}m".replace(".0", "")
    if value >= 1000:
        return f"{value / 1000:.1f}k".replace(".0", "")
    return str(int(round(value)))


def build_post_report(rows, model_terms, included_brands):
    rows = [row for row in rows if norm(row.get("username"))]
    total_posts = len(rows)
    impressions = sum(intish(row.get("impressions")) for row in rows)
    likes = sum(intish(row.get("likes")) for row in rows)
    comments = sum(intish(row.get("comments")) for row in rows)
    engagement = likes + comments
    er = (engagement / impressions * 100) if impressions else 0

    formats = Counter(media_type(row) for row in rows)
    creator_rows = defaultdict(lambda: {"posts": 0, "reels": 0, "stories": 0, "photos": 0, "impressions": 0, "likes": 0, "comments": 0})
    models = defaultdict(lambda: {"posts": 0, "impressions": 0})
    themes = Counter()

    ranked = []
    for row in rows:
        user = "@" + norm(row.get("username")).lstrip("@")
        fmt = media_type(row)
        stats = creator_rows[user]
        stats["posts"] += 1
        stats["impressions"] += intish(row.get("impressions"))
        stats["likes"] += intish(row.get("likes"))
        stats["comments"] += intish(row.get("comments"))
        if fmt == "Reel":
            stats["reels"] += 1
        elif fmt == "Story":
            stats["stories"] += 1
        else:
            stats["photos"] += 1

        caption = norm(row.get("content_caption"))
        detected = detect_models(caption + " " + norm(row.get("src")), model_terms, included_brands)
        detected = [item for item in detected if item not in included_brands]
        if not detected:
            detected = ["General promotion / model unclear"]
        for model in detected[:2]:
            models[model]["posts"] += 1
            models[model]["impressions"] += intish(row.get("impressions"))

        themes[detect_theme(caption)] += 1
        row_engagement = intish(row.get("likes")) + intish(row.get("comments"))
        ranked.append({
            "row": row,
            "creator": user,
            "mediaType": fmt,
            "engagement": row_engagement,
            "engagementRate": number(row.get("engagement")),
            "impressions": intish(row.get("impressions")),
            "followers": intish(row.get("followers")),
        })

    creator_breakdown = []
    for name, stats in sorted(creator_rows.items(), key=lambda item: item[1]["impressions"], reverse=True):
        total_engagement = stats["likes"] + stats["comments"]
        creator_breakdown.append({
            "name": name,
            "url": f"https://www.instagram.com/{name.lstrip('@')}",
            "posts": stats["posts"],
            "reels": stats["reels"],
            "stories": stats["stories"],
            "photos": stats["photos"],
            "impressions": stats["impressions"],
            "likes": stats["likes"],
            "comments": stats["comments"],
            "engagement": total_engagement,
            "engagementRate": round(total_engagement / stats["impressions"] * 100, 2) if stats["impressions"] else 0,
        })

    top_items = build_best_content(ranked)

    theme_total = sum(themes.values()) or 1
    model_rows = [
        {"model": model, "posts": values["posts"], "impressions": values["impressions"]}
        for model, values in sorted(models.items(), key=lambda item: item[1]["posts"], reverse=True)
    ]

    most_active = max(creator_breakdown, key=lambda item: item["posts"], default={"name": "Source needed", "posts": 0, "url": ""})

    return {
        "metrics": {
            "posts": total_posts,
            "videoPosts": formats["Reel"] + formats["Story"],
            "photoPosts": formats["Photo"],
            "impressions": impressions,
            "likes": likes,
            "comments": comments,
        },
        "summary": f"During the reviewed export period, the brand published {total_posts} pieces of Instagram content and generated {compact(impressions)} impressions. The strongest readout comes from creator-led posts with measurable engagement, while caption analysis highlights the main promoted models and recurring content themes.",
        "formats": [
            {"type": key, "posts": count, "share": round(count / total_posts * 100) if total_posts else 0}
            for key, count in formats.most_common()
        ],
        "performance": [
            {"metric": "Impressions", "total": impressions, "average": round(impressions / total_posts) if total_posts else 0},
            {"metric": "Likes", "total": likes, "average": round(likes / total_posts) if total_posts else 0},
            {"metric": "Comments", "total": comments, "average": round(comments / total_posts) if total_posts else 0},
            {"metric": "Engagement", "total": engagement, "average": round(engagement / total_posts) if total_posts else 0},
            {"metric": "Engagement rate", "total": round(er, 2), "average": round(er, 2), "suffix": "%"},
        ],
        "creatorActivity": {
            "activeCreators": len(creator_breakdown),
            "contentCount": total_posts,
            "averagePosts": round(total_posts / len(creator_breakdown), 1) if creator_breakdown else 0,
            "mostActive": {
                "name": most_active["name"],
                "posts": most_active["posts"],
                "url": most_active.get("url", ""),
            },
        },
        "creatorBreakdown": creator_breakdown,
        "bestContent": top_items,
        "promotedModels": model_rows[:8],
        "themes": [
            {"name": theme, "share": round(count / theme_total * 100)}
            for theme, count in themes.most_common(5)
        ],
    }


def content_item(item, label, primary_label, primary_value, secondary_label, secondary_value, extra_metrics=None):
    row = item["row"]
    src = norm(row.get("src"))
    return {
        "label": label,
        "creator": item["creator"],
        "primaryLabel": primary_label,
        "primaryMetric": primary_value,
        "secondaryLabel": secondary_label,
        "secondaryMetric": secondary_value,
        "mediaType": item["mediaType"],
        "mediaUrl": MEDIA_PREFIX + src if src else "",
        "extraMetrics": extra_metrics or [],
    }


def build_best_content(ranked):
    ranked_with_media = [item for item in ranked if norm(item["row"].get("src"))]
    top_post = max(
        (item for item in ranked_with_media if item["mediaType"] != "Story"),
        key=lambda item: item["impressions"],
        default=None,
    )
    top_story = max(
        (item for item in ranked_with_media if item["mediaType"] == "Story"),
        key=lambda item: item["impressions"],
        default=None,
    )

    items = []
    if top_post:
        items.append(
            content_item(
                top_post,
                "Best performing post",
                "Impressions",
                compact(top_post["impressions"]),
                "Engagement rate",
                f"{top_post['engagementRate']:.2f}%",
                [
                    {"label": "Likes", "value": compact(intish(top_post["row"].get("likes")))},
                    {"label": "Comments", "value": compact(intish(top_post["row"].get("comments")))},
                ],
            )
        )
    if top_story:
        impression_rate = (top_story["impressions"] / top_story["followers"] * 100) if top_story["followers"] else 0
        items.append(
            content_item(
                top_story,
                "Best performing story",
                "Impressions",
                compact(top_story["impressions"]),
                "Impression rate",
                f"{impression_rate:.2f}%",
            )
        )
    return items


def count_matches(text, patterns):
    score = 0
    for pattern, weight in patterns:
        if re.search(pattern, text, flags=re.IGNORECASE):
            score += weight
    return score


def has_pattern(text, patterns):
    return any(re.search(pattern, text, flags=re.IGNORECASE) for pattern in patterns)


def sentiment_for_comment(text):
    lower = text.lower().strip()
    if not lower:
        return "neutral"

    if has_pattern(lower, SOFT_NEUTRAL_PATTERNS):
        return "neutral"

    if has_pattern(lower, AMBIGUOUS_PATTERNS):
        return "neutral"

    if has_pattern(lower, PERSON_FOCUSED_PATTERNS):
        return "neutral"

    positive = sum(1 for word in POSITIVE_WORDS if word in lower) + count_matches(lower, STRONG_POSITIVE_PATTERNS)
    negative = sum(1 for word in NEGATIVE_WORDS if word in lower) + count_matches(lower, STRONG_NEGATIVE_PATTERNS)

    is_question = "?" in lower or has_pattern(lower, QUESTION_PATTERNS)
    is_constructive = has_pattern(lower, CONSTRUCTIVE_PATTERNS)
    has_negative_override = has_pattern(lower, NEGATIVE_OVERRIDE_PATTERNS)

    if positive >= 3 and negative == 0:
        return "positive"

    if is_question and negative <= 1 and positive <= 2:
        return "neutral"

    if is_constructive and negative == 0:
        return "neutral"

    if has_negative_override and negative >= positive:
        return "negative"

    if negative >= positive + 2:
        return "negative"

    if positive >= negative + 2:
        return "positive"

    if positive and negative:
        if has_negative_override:
            return "negative"
        if is_question or is_constructive:
            return "neutral"
        return "neutral"

    if negative > positive:
        return "negative"

    if positive > negative:
        return "positive"

    return "neutral"


def comment_target(text, model_terms, allowed_brands):
    lower = text.lower()
    allowed = [brand.lower() for brand in allowed_brands]
    for model, term in model_terms:
        if not any(model.lower().startswith(brand) or model.lower() == brand for brand in allowed):
            continue
        pattern = r"(?<![\w])" + re.escape(term).replace(r"\ ", r"[\s#_-]+") + r"(?![\w])"
        if re.search(pattern, lower, flags=re.IGNORECASE):
            return model
    if any(term in lower for term in ["cena", "drag", "predrag", "popust", "vrednost"]):
        return "Price / value"
    if any(term in lower for term in ["lep", "lepa", "grd", "oblika", "dizajn", "design", "zgleda", "izgleda"]):
        return "Design / appearance"
    if any(term in lower for term in FEATURE_TERMS):
        return "Vehicle feature / usage"
    vehicle_terms = ["avto", "vozilo", "model", "motor", "notranjost", "oblika", "cena", "test"]
    if any(term in lower for term in vehicle_terms):
        return "Vehicle / model"
    return ""


def is_meaningful_opinion(comment, model_terms, allowed_brands):
    if len(comment.strip()) < 12:
        return False
    if not comment_target(comment, model_terms, allowed_brands):
        return False
    lower = comment.lower()
    opinion_terms = [
        *POSITIVE_WORDS,
        *NEGATIVE_WORDS,
        "všeč",
        "zgleda",
        "izgleda",
        "cena",
        "kup",
        "vozil",
        "primerj",
        "preprič",
        "zanima",
        "poraba",
        "trasa",
        "ekran",
        "luči",
        "luci",
        "vlečne",
        "vlecne",
    ]
    return any(term in lower for term in opinion_terms)


def comment_text(row):
    preferred = ["comment", "comments", "text", "body", "message", "content", "caption"]
    for key in preferred:
        if key in row and norm(row[key]):
            return norm(row[key])
    values = [norm(value) for value in row.values() if norm(value)]
    if not values:
        return ""
    return max(values, key=len)


def build_comment_report(rows, model_terms, allowed_brands):
    comments = [comment_text(row) for row in rows]
    comments = [comment for comment in comments if comment and not comment.isdigit()]
    counts = Counter(sentiment_for_comment(comment) for comment in comments)
    total = sum(counts.values())
    if not total:
        return {"commentsAnalysed": 0, "sentiment": "", "sentimentNote": "sentimenta ni mogoče razbrati"}
    positive_share = counts["positive"] / total
    negative_share = counts["negative"] / total
    if positive_share >= 0.2 and positive_share >= negative_share * 1.4:
        overall = "positive"
    elif negative_share >= 0.2 and negative_share > positive_share:
        overall = "negative"
    else:
        overall = "neutral"

    positives = [
        {
            "text": comment,
            "target": comment_target(comment, model_terms, allowed_brands),
        }
        for comment in comments
        if sentiment_for_comment(comment) == "positive" and is_meaningful_opinion(comment, model_terms, allowed_brands)
    ][:5]
    negatives = [
        {
            "text": comment,
            "target": comment_target(comment, model_terms, allowed_brands),
        }
        for comment in comments
        if sentiment_for_comment(comment) == "negative" and is_meaningful_opinion(comment, model_terms, allowed_brands)
    ][:5]
    insight = (
        f"Analysed comments are mostly {overall}. "
        f"Positive cues account for {round(positive_share * 100)}% of detected sentiment and negative cues for {round(negative_share * 100)}%."
    )
    return {
        "commentsAnalysed": total,
        "sentiment": overall,
        "sentimentSummary": insight,
        "positiveExamples": positives,
        "negativeExamples": negatives,
    }


def refresh(report_path, models_path, posts_dir, comments_dir):
    data = json.loads(report_path.read_text(encoding="utf-8"))
    model_terms = load_model_terms(models_path)
    period = data["periods"][0]
    period["id"] = "2026-apr-23"
    period["label"] = "23 April 2026 export"
    period["summary"] = "Benchmark overview of Instagram creator activity based on post and comment exports supplied on 23 April 2026."
    data["activePeriodId"] = period["id"]

    summaries = []
    duplicate_summary = {}
    period_dates = []
    for brand in period["brands"]:
        if brand["name"] not in POST_FILES:
            continue
        rows, removed_duplicates = remove_feed_post_reel_duplicates(read_csv(posts_dir / POST_FILES[brand["name"]]))
        duplicate_summary[brand["name"]] = removed_duplicates
        date_range = date_range_from_posts(rows)
        if date_range:
            period_dates.extend(date_range)
        allowed_brands = list(dict.fromkeys([*(brand.get("brandsIncluded") or []), brand["name"].split()[0]]))
        post_report = build_post_report(rows, model_terms, allowed_brands)
        brand.update(post_report["metrics"])
        report = brand.setdefault("report", {})
        for key in [
            "summary",
            "formats",
            "performance",
            "creatorActivity",
            "creatorBreakdown",
            "bestContent",
            "promotedModels",
            "themes",
        ]:
            report[key] = post_report[key]

        comment_rows = []
        for file_name in COMMENT_FILES.get(brand["name"], []):
            comment_rows.extend(read_xlsx(comments_dir / file_name))
        report["community"] = build_comment_report(comment_rows, model_terms, allowed_brands)
        summaries.append((brand["name"], brand["posts"], brand["impressions"], brand["likes"] + brand["comments"]))

    if period_dates:
        period["startDate"] = min(period_dates).isoformat()
        period["endDate"] = max(period_dates).isoformat()

    top_impressions = max(summaries, key=lambda item: item[2])
    top_engagement = max(summaries, key=lambda item: item[3])
    period["summary"] = (
        f"Across the supplied exports, {len(summaries)} brands were analysed. "
        f"{top_impressions[0]} generated the highest impressions, while {top_engagement[0]} generated the highest total engagement."
    )
    period["dataCleaning"] = {
        "feedPostReelDuplicatesRemoved": duplicate_summary
    }
    report_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: refresh_report_from_exports.py <posts-dir> <comments-dir>", file=sys.stderr)
        sys.exit(2)
    root = Path(__file__).resolve().parents[1]
    refresh(
        root / "data" / "report-data.json",
        root / "data" / "promoted-models.json",
        Path(sys.argv[1]),
        Path(sys.argv[2]),
    )
