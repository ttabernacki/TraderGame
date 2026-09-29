#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "MarketSubsystem.generated.h"

USTRUCT()
struct FGoodDef
{
	GENERATED_BODY()

	FName Id;
	FString Name;
	float BasePrice = 10.f;
};

USTRUCT()
struct FCityState
{
	GENERATED_BODY()

	FName Id;
	FString Name;
	float Lat = 0.f;
	float Lon = 0.f;
	// Units/day.
	TMap<FName, float> Produces;
	TMap<FName, float> Consumes;
	TMap<FName, float> Stock;
};

DECLARE_MULTICAST_DELEGATE(FOnMarketChanged);

/**
 * Trading core: cities with stock-driven prices, a daily production/consumption
 * tick, and a single player merchant (gold, cargo, location). Mirrors the
 * economy in the web build (src/game/economy.ts) in a much reduced form.
 */
UCLASS()
class UMarketSubsystem : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void OnWorldBeginPlay(UWorld& InWorld) override;
	virtual void Deinitialize() override;
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;

	const TArray<FGoodDef>& GetGoods() const { return Goods; }
	const TArray<FCityState>& GetCities() const { return Cities; }

	float GetPrice(int32 CityIdx, int32 GoodIdx) const;
	float GetStock(int32 CityIdx, int32 GoodIdx) const;
	float DistanceKm(int32 A, int32 B) const;

	bool Buy(int32 GoodIdx, int32 Qty);
	bool Sell(int32 GoodIdx, int32 Qty);
	bool TravelTo(int32 CityIdx);

	int32 Day = 0;
	float Gold = 500.f;
	int32 CurrentCity = 0;
	TMap<FName, int32> Cargo;
	int32 CargoCapacity = 40;
	FString LastMessage;
	FOnMarketChanged OnChanged;

	int32 CargoUsed() const;

private:
	void BuildWorldData();
	void AdvanceDay();

	TArray<FGoodDef> Goods;
	TArray<FCityState> Cities;
	FTimerHandle DayTimer;
};
