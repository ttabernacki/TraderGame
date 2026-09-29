# Hansa Trader (Unreal Engine 5.4, C++)

Playable text-HUD trading prototype: five Holy Roman Empire cities, six goods,
stock-driven prices, daily production/consumption, and a merchant who buys,
sells and travels. It needs no content assets: everything is C++ and draws with `AHUD`.

## Run
1. Install UE 5.4 and a C++ toolchain (VS 2022 / Xcode / clang).
2. Right-click `HansaTrader.uproject` > Generate project files, then build and open.
3. Press Play. The default map is `/Engine/Maps/Entry`; any map works because
   `ATraderGameMode` is the global default game mode.

## Controls
Up/Down select good, B buy 5, S sell 5, Left/Right select destination, Enter travel.

## Layout
- `UMarketSubsystem`: world subsystem holding sim and player state (day timer, prices, buy/sell/travel).
- `ATraderHUD`: draws state. `ATraderPlayerController`: raw key bindings.
- `ATraderGameMode`: wires the above together.

Status: not compiled in CI. It was written without an engine install available.
