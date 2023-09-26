
# Introduction

This is a small CLI tool written for the Advanced Operating Systems course to create realtime schedule diagrams. It provides several commands to perform different tasks related to scheduling and simulation.

The available commands are:

1. `dump`: This command is used to dump out examples of schedules. It takes two arguments: the scheduler to use and the example number. It returns the JSON representation of the specified schedule.

```
bunx aos-sched dump cfs 0

>> {"timer":0.5,"runfor":8,"class":{"type":"CFS","latency":6,"mingran":0.75,"wgup":1},"tasks":[{"index":0,"name":"$t_1$","lambda":1,"start":0,"events":[8],"vrt":100},{"index":1,"name":"$t_2$","lambda":1,"start":0,"events":[8],"vrt":100.5},{"index":2,"name":"$t_3$","lambda":1,"start":0,"events":[8],"vrt":101}],"graphics":{"vspace":1,"hspace":1,"barheight":0.5}}


```

2. `simulate`: This command is used to simulate a provided schedule. It takes two arguments: the scheduler to use and the JSON file or stdin containing the schedule data (perhaps from one of the examples). It simulates the schedule using the specified scheduler and returns the JSON representation of the simulated schedule.

```
bunx aos-sched dump cfs 0 | bunx aos-sched simulate cfs
```

3. `export`: This command is used to export simulation data to available formats (complete, blank, data). It takes two arguments: the artifact name and the JSON file or stdin containing the simulation data. It exports the simulation data in the specified artifact format (which at the moment is latex tikz).

```
bunx aos-sched dump cfs 0 | bunx aos-sched simulate cfs | bunx aos-sched export complete
```

# Example

```
bunx aos-sched dump cfs 0 | bunx aos-sched simulate cfs | bunx aos-sched export complete
```

will produce a latex file that when compiled and exported to png gives

![](./example.png)



