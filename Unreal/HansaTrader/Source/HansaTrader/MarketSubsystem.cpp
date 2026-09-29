#include "MarketSubsystem.h"
#include "Engine/World.h"
#include "TimerManager.h"

namespace
{
	constexpr float DaySeconds = 2.f;
	constexpr float TravelKmPerDay = 35.f;
	constexpr float TargetStock = 100.f;
	constexpr float SpreadMargin = 0.06f; // buy/sell spread
}

bool UMarketSubsystem::ShouldCreateSubsystem(UObject* Outer) const
{
	const UWorld* World = Cast<UWorld>(Outer);
	return World && World->IsGameWorld();
}

void UMarketSubsystem::OnWorldBeginPlay(UWorld& InWorld)
{
	Super::OnWorldBeginPlay(InWorld);
	BuildWorldData();
	InWorld.GetTimerManager().SetTimer(DayTimer, this, &UMarketSubsystem::AdvanceDay, DaySeconds, true);
	LastMessage = TEXT("Welcome, merchant of Augsburg.");
	OnChanged.Broadcast();
}

void UMarketSubsystem::Deinitialize()
{
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(DayTimer);
	}
	Super::Deinitialize();
}

void UMarketSubsystem::BuildWorldData()
{
	auto AddGood = [this](const TCHAR* Id, const TCHAR* Name, float Base)
	{
		FGoodDef G; G.Id = Id; G.Name = Name; G.BasePrice = Base; Goods.Add(G);
	};
	AddGood(TEXT("grain"), TEXT("Grain"), 8.f);
	AddGood(TEXT("salt"), TEXT("Salt"), 14.f);
	AddGood(TEXT("beer"), TEXT("Beer"), 12.f);
	AddGood(TEXT("cloth"), TEXT("Cloth"), 30.f);
	AddGood(TEXT("wine"), TEXT("Wine"), 26.f);
	AddGood(TEXT("spices"), TEXT("Spices"), 60.f);

	auto AddCity = [this](const TCHAR* Id, const TCHAR* Name, float Lat, float Lon,
		TMap<FName, float> Produces, TMap<FName, float> Consumes)
	{
		FCityState C;
		C.Id = Id; C.Name = Name; C.Lat = Lat; C.Lon = Lon;
		C.Produces = MoveTemp(Produces); C.Consumes = MoveTemp(Consumes);
		for (const FGoodDef& G : Goods) { C.Stock.Add(G.Id, TargetStock); }
		Cities.Add(MoveTemp(C));
	};
	AddCity(TEXT("augsburg"), TEXT("Augsburg"), 48.37f, 10.90f,
		{ {"cloth", 1.8f} }, { {"grain", 0.5f}, {"salt", 0.4f}, {"wine", 0.9f}, {"beer", 0.9f}, {"spices", 0.3f} });
	AddCity(TEXT("nuremberg"), TEXT("Nurnberg"), 49.45f, 11.08f,
		{ {"cloth", 1.0f} }, { {"grain", 0.5f}, {"salt", 0.4f}, {"wine", 0.7f}, {"beer", 0.9f}, {"spices", 0.3f} });
	AddCity(TEXT("hamburg"), TEXT("Hamburg"), 53.55f, 10.0f,
		{ {"salt", 1.6f}, {"beer", 1.6f}, {"grain", 0.8f} }, { {"cloth", 0.6f}, {"wine", 0.7f}, {"spices", 0.2f} });
	AddCity(TEXT("cologne"), TEXT("Koln"), 50.94f, 6.96f,
		{ {"wine", 1.5f}, {"cloth", 0.8f} }, { {"grain", 0.4f}, {"salt", 0.4f}, {"beer", 0.6f}, {"spices", 0.3f} });
	AddCity(TEXT("venice"), TEXT("Venice"), 45.44f, 12.32f,
		{ {"spices", 1.2f}, {"wine", 0.8f} }, { {"grain", 0.6f}, {"salt", 0.3f}, {"beer", 0.5f}, {"cloth", 0.7f} });
}

float UMarketSubsystem::GetStock(int32 CityIdx, int32 GoodIdx) const
{
	if (!Cities.IsValidIndex(CityIdx) || !Goods.IsValidIndex(GoodIdx)) { return 0.f; }
	const float* S = Cities[CityIdx].Stock.Find(Goods[GoodIdx].Id);
	return S ? *S : 0.f;
}

float UMarketSubsystem::GetPrice(int32 CityIdx, int32 GoodIdx) const
{
	if (!Goods.IsValidIndex(GoodIdx)) { return 0.f; }
	// Scarcity curve: price rises as stock falls below target.
	const float Ratio = TargetStock / FMath::Max(GetStock(CityIdx, GoodIdx), 10.f);
	return Goods[GoodIdx].BasePrice * FMath::Clamp(Ratio, 0.35f, 3.f);
}

float UMarketSubsystem::DistanceKm(int32 A, int32 B) const
{
	if (!Cities.IsValidIndex(A) || !Cities.IsValidIndex(B)) { return 0.f; }
	const float R = 6371.f;
	const float La1 = FMath::DegreesToRadians(Cities[A].Lat), La2 = FMath::DegreesToRadians(Cities[B].Lat);
	const float dLa = La2 - La1;
	const float dLo = FMath::DegreesToRadians(Cities[B].Lon - Cities[A].Lon);
	const float H = FMath::Square(FMath::Sin(dLa / 2)) + FMath::Cos(La1) * FMath::Cos(La2) * FMath::Square(FMath::Sin(dLo / 2));
	return 2 * R * FMath::Asin(FMath::Min(1.f, FMath::Sqrt(H)));
}

int32 UMarketSubsystem::CargoUsed() const
{
	int32 N = 0;
	for (const TPair<FName, int32>& P : Cargo) { N += P.Value; }
	return N;
}

bool UMarketSubsystem::Buy(int32 GoodIdx, int32 Qty)
{
	if (!Goods.IsValidIndex(GoodIdx) || Qty <= 0) { return false; }
	const float Unit = GetPrice(CurrentCity, GoodIdx) * (1.f + SpreadMargin);
	float& Stock = Cities[CurrentCity].Stock.FindOrAdd(Goods[GoodIdx].Id);
	if (Stock < Qty) { LastMessage = TEXT("Not enough stock."); }
	else if (CargoUsed() + Qty > CargoCapacity) { LastMessage = TEXT("Wagon is full."); }
	else if (Gold < Unit * Qty) { LastMessage = TEXT("Not enough gold."); }
	else
	{
		Gold -= Unit * Qty;
		Stock -= Qty;
		Cargo.FindOrAdd(Goods[GoodIdx].Id) += Qty;
		LastMessage = FString::Printf(TEXT("Bought %d %s for %.0f."), Qty, *Goods[GoodIdx].Name, Unit * Qty);
		OnChanged.Broadcast();
		return true;
	}
	OnChanged.Broadcast();
	return false;
}

bool UMarketSubsystem::Sell(int32 GoodIdx, int32 Qty)
{
	if (!Goods.IsValidIndex(GoodIdx) || Qty <= 0) { return false; }
	int32* Held = Cargo.Find(Goods[GoodIdx].Id);
	if (!Held || *Held < Qty) { LastMessage = TEXT("You don't carry that."); OnChanged.Broadcast(); return false; }
	const float Unit = GetPrice(CurrentCity, GoodIdx) * (1.f - SpreadMargin);
	Gold += Unit * Qty;
	*Held -= Qty;
	Cities[CurrentCity].Stock.FindOrAdd(Goods[GoodIdx].Id) += Qty;
	LastMessage = FString::Printf(TEXT("Sold %d %s for %.0f."), Qty, *Goods[GoodIdx].Name, Unit * Qty);
	OnChanged.Broadcast();
	return true;
}

bool UMarketSubsystem::TravelTo(int32 CityIdx)
{
	if (!Cities.IsValidIndex(CityIdx) || CityIdx == CurrentCity) { return false; }
	const int32 Days = FMath::Max(1, FMath::CeilToInt(DistanceKm(CurrentCity, CityIdx) / TravelKmPerDay));
	for (int32 i = 0; i < Days; ++i) { AdvanceDay(); }
	CurrentCity = CityIdx;
	LastMessage = FString::Printf(TEXT("Arrived in %s after %d days."), *Cities[CityIdx].Name, Days);
	OnChanged.Broadcast();
	return true;
}

void UMarketSubsystem::AdvanceDay()
{
	++Day;
	for (FCityState& C : Cities)
	{
		for (const FGoodDef& G : Goods)
		{
			float& S = C.Stock.FindOrAdd(G.Id);
			if (const float* P = C.Produces.Find(G.Id)) { S += *P * 4.f; }
			if (const float* Q = C.Consumes.Find(G.Id)) { S -= *Q * 4.f; }
			// Gentle mean reversion keeps the sim from running away.
			S += (TargetStock - S) * 0.01f;
			S = FMath::Max(S, 0.f);
		}
	}
	OnChanged.Broadcast();
}
