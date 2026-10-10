from __future__ import annotations

import base64
import heapq
import html
import json
import math
import random
from dataclasses import dataclass


@dataclass(frozen=True)
class Rover:
    name: str
    battery: float = 220
    solar: float = 60
    wheels: float = 1.2
    caution: float = 1.0
    cargo: int = 18


@dataclass(frozen=True)
class World:
    heights: list[list[float]]
    seed: int
    base: tuple[int, int] = (3, 12)
    sites: tuple[tuple[int, int], ...] = ((14, 5), (32, 11), (20, 20))


def make_world(seed: int = 7, roughness: float = 1.0) -> World:
    rng = random.Random(seed)
    phases = [rng.uniform(0, math.tau) for _ in range(3)]
    heights = [
        [
            max(
                0.05,
                min(
                    1.0,
                    0.48
                    + roughness
                    * (
                        0.19 * math.sin(x * 0.24 + phases[0])
                        + 0.15 * math.cos(y * 0.31 + phases[1])
                        + 0.13 * math.sin((x + y) * 0.44 + phases[2])
                        + rng.uniform(-0.06, 0.06)
                    ),
                ),
            )
            for x in range(38)
        ]
        for y in range(24)
    ]
    return World(heights, seed)


def route(
    world: World, start: tuple[int, int], goal: tuple[int, int], caution: float
) -> list[tuple[int, int]]:
    frontier = [(0.0, start)]
    costs = {start: 0.0}
    previous = {}
    while frontier:
        cost, here = heapq.heappop(frontier)
        if here == goal:
            path = [goal]
            while path[-1] != start:
                path.append(previous[path[-1]])
            return path[::-1]
        if cost > costs[here]:
            continue
        x, y = here
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < 38 and 0 <= ny < 24):
                continue
            slope = abs(world.heights[ny][nx] - world.heights[y][x])
            step = 1 + caution * (slope * 15 + world.heights[ny][nx] * 0.6)
            candidate = cost + step
            if candidate < costs.get((nx, ny), math.inf):
                costs[nx, ny] = candidate
                previous[nx, ny] = here
                heapq.heappush(frontier, (candidate, (nx, ny)))
    raise ValueError("No route reaches the next sample site.")


def drive(world: World, rover: Rover, storm: float, daylight: float) -> dict:
    values = (rover.battery, rover.solar, rover.wheels, rover.caution, rover.cargo)
    if not all(math.isfinite(value) for value in values):
        raise ValueError(f"{rover.name}: use finite vehicle settings.")
    if (
        rover.battery <= 0
        or rover.wheels <= 0
        or min(rover.solar, rover.caution, rover.cargo) < 0
    ):
        raise ValueError(
            f"{rover.name}: battery and wheels must be positive; other "
            f"settings cannot be negative."
        )
    battery = rover.battery
    charge = [[0.0, 100.0]]
    path = [world.base]
    samples = 0
    mass = 0.7 + rover.battery * 0.003 + rover.solar * 0.0015 + rover.cargo * 0.012
    returned = True
    for index, target in enumerate((*world.sites, world.base)):
        leg = route(world, path[-1], target, rover.caution)
        for x, y in leg[1:]:
            px, py = path[-1]
            slope = abs(world.heights[y][x] - world.heights[py][px])
            consumption = (
                (1.25 + slope * 15 / rover.wheels + world.heights[y][x] * 0.55)
                * mass
                * (1 + storm * 0.8)
            )
            recharge = rover.solar * 0.025 * daylight * (1 - storm) ** 2
            battery = min(rover.battery, battery - max(0.1, consumption - recharge))
            path.append((x, y))
            charge.append(
                [
                    round((len(path) - 1) * 0.3, 1),
                    round(max(0, battery) / rover.battery * 100, 1),
                ]
            )
            if battery <= 0:
                returned = False
                break
        if not returned:
            break
        if index < len(world.sites):
            samples = min(rover.cargo, samples + 7 + index * 4)
    cost = round(
        45
        + rover.battery * 0.13
        + rover.solar * 0.4
        + rover.wheels * 15
        + rover.cargo * 0.7
    )
    delivered = samples if returned else 0
    return {
        "name": rover.name,
        "path": path,
        "charge": charge,
        "returned": returned,
        "samples": delivered,
        "cost": cost,
        "efficiency": round(delivered / cost * 100, 1),
        "battery": round(max(0, battery)),
        "distance": round((len(path) - 1) * 0.3, 1),
    }


COLORS = ("#5eead4", "#f9a8d4", "#fbbf24", "#93c5fd", "#c4b5fd")


def mission_map(world: World, results: list[dict], storm: float) -> str:
    parts = [
        (
            '<svg xmlns="http://www.w3.org/2000/svg" width="1000" '
            'height="650" viewBox="0 0 1000 650">'
        ),
        '<rect width="1000" height="650" rx="20" fill="#0b1725"/>',
    ]
    parts.append(
        f'<text x="28" y="35" fill="#e2e8f0" font-family="sans-serif" '
        f'font-size="19" font-weight="bold">ARES SURVEY / SEED '
        f"{world.seed:02d}</text>"
    )
    parts.append(
        f'<text x="780" y="35" fill="#cba57e" font-family="sans-serif" '
        f'font-size="13">DUST {storm:.0%}</text>'
    )
    for y, row in enumerate(world.heights):
        for x, height in enumerate(row):
            red, green, blue = (
                round(45 + 139 * height),
                round(40 + 64 * height),
                round(47 + 20 * height),
            )
            parts.append(
                f'<rect x="{28 + x * 20}" y="{60 + y * 22}" width="20.3" '
                f'height="22.3" fill="rgb({red},{green},{blue})"/>'
            )
    for index, result in enumerate(results):
        color = COLORS[index % len(COLORS)]
        points = " ".join(f"{38 + x * 20},{71 + y * 22}" for x, y in result["path"])
        offset = (index - 1) * 2
        parts.append(
            f'<polyline points="{points}" '
            f'transform="translate({offset},{offset})" fill="none" '
            f'stroke="#07111f" stroke-width="6" opacity="0.65"/>'
        )
        parts.append(
            f'<polyline points="{points}" '
            f'transform="translate({offset},{offset})" fill="none" '
            f'stroke="{color}" stroke-width="2.5" stroke-linejoin="round"/>'
        )
        x, y = result["path"][-1]
        if not result["returned"]:
            parts.append(
                f'<text x="{30 + x * 20}" y="{80 + y * 22}" fill="{color}" '
                f'stroke="#07111f" stroke-width="1" font-family="sans-serif" '
                f'font-size="29">&#215;</text>'
            )
        top = 100 + index * 128
        name = html.escape(str(result["name"]))
        status = "HOME" if result["returned"] else "STRANDED"
        parts.append(
            f'<g font-family="sans-serif"><circle cx="815" cy="{top - 5}" '
            f'r="4" fill="{color}"/><text x="829" y="{top}" fill="{color}" '
            f'font-size="17">{name}</text><text x="810" y="{top + 27}" '
            f'fill="#e2e8f0" font-size="12">{status}</text><text x="810" '
            f'y="{top + 49}" fill="#a0b1c7" font-size="12">'
            f"{result['samples']} samples / {result['distance']} km</text>"
            f'<text x="810" y="{top + 71}" fill="#a0b1c7" font-size="12">'
            f"{result['battery']} Wh remaining</text></g>"
        )
    for index, (x, y) in enumerate(world.sites, 1):
        parts.append(
            f'<circle cx="{38 + x * 20}" cy="{71 + y * 22}" r="12" '
            f'fill="#0b1725" stroke="#f8fafc" stroke-width="2"/><text '
            f'x="{38 + x * 20}" y="{76 + y * 22}" text-anchor="middle" '
            f'fill="#f8fafc" font-family="sans-serif" font-size="14">'
            f"{index}</text>"
        )
    x, y = world.base
    parts.append(
        f'<path d="M{38 + x * 20},{79 + y * 22}v-25l18,5-18,6" '
        f'fill="#f8fafc" stroke="#0b1725" stroke-width="2"/>'
    )
    parts.append(
        '<text x="28" y="622" fill="#9dafc7" font-family="sans-serif" '
        'font-size="13">FLAG = BASE     1 / 2 / 3 = SAMPLE SITES     '
        "BRIGHT TERRAIN = HIGH GROUND</text></svg>"
    )
    return "".join(parts)


def run_mission(
    world: World,
    fleet: list[Rover],
    storm: float = 0.2,
    daylight: float = 1,
    budget: float = 160,
) -> list[dict]:
    if not 0 <= storm <= 1 or not 0 <= daylight <= 1 or budget <= 0:
        raise ValueError(
            "Use storm and daylight between 0 and 1, and a positive budget."
        )
    if not fleet:
        raise ValueError("Add at least one rover to Fleet, then launch again.")
    results = [drive(world, rover, storm, daylight) for rover in fleet]
    eligible = [
        result for result in results if result["returned"] and result["cost"] <= budget
    ]
    winner = max(eligible, key=lambda result: result["efficiency"], default=None)
    headline = (
        f"**{winner['name']} wins on science per credit.**"
        if winner
        else "**No rover completed the mission within budget yet.**"
    )
    report = f"## Mission debrief\n\n{headline}\n\n"
    report += (
        f"**{sum(result['returned'] for result in results)}/{len(results)} "
        f"rovers returned.** Budget: **{budget:g} credits per "
        f"vehicle**. Dust: **{storm:.0%}**. Daylight: "
        f"**{daylight:.0%}**.\n\n"
    )
    report += (
        "A bigger battery also makes the rover heavier. Larger wheels "
        "reduce the penalty of steep ground. Caution chooses flatter "
        "routes, sometimes at the cost of distance. Dust increases "
        "driving cost and blocks sunlight.\n\n**Next experiment:** "
        "hold the seed fixed, change one vehicle setting, and compare "
        "its battery curve before changing the weather."
    )
    image = (
        "data:image/svg+xml;base64,"
        + base64.b64encode(mission_map(world, results, storm).encode()).decode()
    )
    return [
        {
            "id": "terrain",
            "kind": "image",
            "title": "Mission map",
            "caption": (
                "Each colored route is the path actually travelled. A cross "
                "marks where a rover exhausted its battery."
            ),
            "image": image,
        },
        {
            "id": "energy",
            "kind": "chart",
            "title": "Battery telemetry",
            "caption": (
                "Each point is a completed terrain step. Toggle rover names to "
                "isolate a curve."
            ),
            "xLabel": "Distance (km)",
            "yLabel": "Battery (%)",
            "series": [
                {
                    "label": r["name"],
                    "color": COLORS[i % len(COLORS)],
                    "points": r["charge"],
                }
                for i, r in enumerate(results)
            ],
        },
        {
            "id": "scoreboard",
            "kind": "table",
            "title": "Fleet comparison",
            "caption": (
                "Only samples delivered back to base count. Over-budget "
                "vehicles still run, but cannot win the challenge."
            ),
            "columns": [
                "Rover",
                "Status",
                "Samples",
                "Cost",
                "Science / 100",
                "Battery Wh",
            ],
            "rows": [
                [
                    r["name"],
                    "Home" if r["returned"] else "Stranded",
                    r["samples"],
                    r["cost"],
                    r["efficiency"],
                    r["battery"],
                ]
                for r in results
            ],
        },
        {
            "id": "report",
            "kind": "markdown",
            "title": "Mission debrief",
            "caption": "A deliberately simplified, deterministic engineering game.",
            "text": report,
        },
    ]


def show(panels: list[dict]) -> None:
    print(
        "SETTA_DISPLAY " + json.dumps({"version": 1, "panels": panels}, allow_nan=False)
    )
