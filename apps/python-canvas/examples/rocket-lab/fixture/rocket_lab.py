import math


def trajectory(world: str, speed: float, angle: float, gravity: float) -> str:
    values = (speed, angle, gravity)
    if not all(math.isfinite(value) for value in values):
        return "Use finite numbers for speed, angle, and gravity, then launch again."
    if speed <= 0 or gravity <= 0 or not 0 < angle < 90:
        return (
            "Try a positive speed and gravity, and an angle between 1 and 89 degrees."
        )
    radians = math.radians(angle)
    horizontal = speed * math.cos(radians)
    vertical = speed * math.sin(radians)
    duration = 2 * vertical / gravity
    distance = horizontal * duration
    height = vertical**2 / (2 * gravity)
    scale = max(distance / 48, height / 11, 1)
    sky = [[" " for _ in range(49)] for _ in range(12)]
    for step in range(97):
        time = duration * step / 96
        x = min(48, round(horizontal * time / scale))
        y = min(11, max(0, round((vertical * time - gravity * time**2 / 2) / scale)))
        sky[11 - y][x] = "*"
    drawing = "\n".join("|" + "".join(row).rstrip() for row in sky)
    return (
        f"\n{world.upper()} LAUNCH  /  {speed:g} m/s at {angle:g} degrees\n"
        f"{drawing}\n+{'-' * 49}\n"
        f"Range {distance:.1f} m  |  Height {height:.1f} m  |  "
        f"Air time {duration:.1f} s\n"
        "Same launch, different world. No air resistance in this little lab.\n"
    )
