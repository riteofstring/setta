from rover_mission import Rover, make_world, run_mission, show

world = make_world(seed=7, roughness=1.0)
fleet = [
    Rover("Scout", battery=180, solar=75, wheels=1.0, caution=0.3, cargo=10),
    Rover("Hauler", battery=300, solar=25, wheels=1.5, caution=1.5, cargo=30),
    Rover("Pathfinder", battery=240, solar=65, wheels=1.8, caution=3, cargo=20),
]
show(run_mission(world, fleet, storm=0.2, daylight=1.0, budget=160))
