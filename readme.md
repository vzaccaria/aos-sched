
# Introduction

This is a small CLI tool written for the Advanced Operating Systems course to create realtime schedule diagrams from schedule plans. It provides several sub-commands that can be chained together to simulate and print task scheduling scenarios. 


![](Images/readme%202024-03-31%2011.24.57.excalidraw.png)
[☆](Images/readme%202024-03-31%2011.24.57.excalidraw.md)


At the moment, the following schedulers are implemented:

- CFS (Linux CFS)

The available commands are:


2. `simulate`: This command is used to produce, by simulation, a realtime schedule from a schedule plan. It takes two arguments: the scheduler to use and the JSON file or stdin containing the schedule data `Plan` (for examples of CFS schedules look at its [test files](./lib/cfs/fixtures.ts)). It simulates the schedule using the specified scheduler and returns the JSON representation of the simulated schedule (`Schedule`).

  ```
   bunx aos-sched dump cfs 0 | bunx aos-sched simulate cfs
   ```

3. `export`: This command is used to export simulation data to available formats. It takes two arguments: the artifact name and the JSON file or stdin containing the simulation data. It exports the simulation data in the specified artifact format. At the moment there are three artifacts (`blank`, `complete`, `data`) that output latex source code.

   ```
   bunx aos-sched dump cfs 0 | bunx aos-sched simulate cfs | bunx aos-sched export complete
   ```

1. `dump`: This command is optional and is used to dump out examples of schedule plans which are wired in the tool (they are the one used for tests). These might have or not parameters specific to the scheduler itself. It takes two arguments: the scheduler to use and the example number. It returns the JSON representation of the specified schedule.

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

## Example
This example generates a `Plan` for example n. 0 of the cfs scheduler, produces the corresponding `Schedule` and converts it into a latex file:

```
bunx aos-sched dump cfs 0 | bunx aos-sched simulate cfs | bunx aos-sched export complete
```

The resulting latex file is a Tikz picture that when compiled and exported to png will give the following diagram

![](Images/example.png)


# Internal data structures

![](Images/readme%202024-03-31%2011.46.50.excalidraw.png)
%%[🖋 Edit in Excalidraw](Images/readme%202024-03-31%2011.46.50.excalidraw.md)%%
