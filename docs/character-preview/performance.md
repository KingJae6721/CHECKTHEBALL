# Measured render comparison

| Count | Appearance | Meshes | Materials | Vertices (instances) | Triangles (instances) | Bones | Draw calls (scene) | Frame p50/p95 ms | render() p50/p95 ms |
|---|---|---|---|---|---|---|---|---|---|
| 1 | legacy | 24 | 4 | 4353 | 7320 | 0 | 26 | 6.90 / 7.10 | 0.40 / 0.50 |
| 1 | minimal | 3 | 1 | 844 | 1644 | 21 | 5 | 6.90 / 7.10 | 0.20 / 0.30 |
| 1 | hidden | 3 | 1 | 844 | 1644 | 21 | 2 | 6.90 / 7.10 | 0.10 / 0.20 |
| 2 | legacy | 48 | 8 | 8706 | 14640 | 0 | 51 | 6.90 / 7.10 | 0.40 / 0.60 |
| 2 | minimal | 6 | 1 | 1688 | 3288 | 42 | 9 | 6.90 / 7.10 | 0.20 / 0.40 |
| 2 | hidden | 6 | 1 | 1688 | 3288 | 42 | 3 | 6.90 / 7.10 | 0.10 / 0.20 |
| 8 | legacy | 192 | 32 | 34824 | 58560 | 0 | 201 | 6.90 / 7.10 | 0.90 / 1.30 |
| 8 | minimal | 24 | 1 | 6752 | 13152 | 168 | 33 | 6.90 / 7.10 | 0.40 / 0.60 |
| 8 | hidden | 24 | 1 | 6752 | 13152 | 168 | 9 | 6.90 / 7.10 | 0.20 / 0.30 |

Hidden retains allocated rigs, geometry and bones; only character rendering is disabled. Floor and balls stay visible.
GPU time was not measured. render() is main-thread elapsed time, not GPU or whole-game CPU time.
These short sequential samples do not establish a game bottleneck or an FPS gain.
