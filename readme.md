
# Introduction

This is a small CLI tool written for the Advanced Operating Systems course to create realtime schedule diagrams from schedule plans. It provides several commands to perform different tasks related to scheduling and simulation. At the moment, the following schedulers are implemented:

- CFS (Linux CFS)

The available commands are:

1. `dump`: This command is used to dump out examples of schedule plans which are wired in the tool (they are the one used for tests). These might have or not parameters specific to the scheduler itself. It takes two arguments: the scheduler to use and the example number. It returns the JSON representation of the specified schedule.

   ```
   bunx aos-sched dump cfs 0 | jq .
   ```

   ```json
   {
     "timer": 0.5,
     "runfor": 8,
     "class": {
       "type": "CFS",
       "latency": 6,
       "mingran": 0.75,
       "wgup": 1
     },
     "tasks": [
       {
         "index": 0,
         "name": "$t_1$",
         "lambda": 1,
         "start": 0,
         "events": [
           8
         ],
         "vrt": 100
       },
       ...
   ```

2. `simulate`: This command is used to produce, by simulation, a realtime schedule from a schedule plan. It takes two arguments: the scheduler to use and the JSON file or stdin containing the schedule data (perhaps from one of the examples, see above). It simulates the schedule using the specified scheduler and returns the JSON representation of the simulated schedule.

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



