#include "TraderHUD.h"
#include "MarketSubsystem.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"

void ATraderHUD::DrawHUD()
{
	Super::DrawHUD();
	const UMarketSubsystem* M = GetWorld() ? GetWorld()->GetSubsystem<UMarketSubsystem>() : nullptr;
	if (!M || M->GetCities().Num() == 0) { return; }

	UFont* Font = GEngine->GetMediumFont();
	float Y = 40.f;
	auto Line = [&](const FString& Text, FLinearColor Color = FLinearColor::White)
	{
		DrawText(Text, Color, 40.f, Y, Font, 1.2f);
		Y += 26.f;
	};

	Line(FString::Printf(TEXT("HANSA TRADER   Day %d   Gold %.0f   Cargo %d/%d"),
		M->Day, M->Gold, M->CargoUsed(), M->CargoCapacity), FLinearColor::Yellow);
	Line(FString::Printf(TEXT("You are in %s"), *M->GetCities()[M->CurrentCity].Name));
	Y += 10.f;

	Line(TEXT("Market                 Price   Stock   Carried"), FLinearColor(0.7f, 0.7f, 0.7f));
	for (int32 g = 0; g < M->GetGoods().Num(); ++g)
	{
		const FGoodDef& G = M->GetGoods()[g];
		const int32* Held = M->Cargo.Find(G.Id);
		Line(FString::Printf(TEXT("%s %-14s %6.1f  %6.0f  %5d"),
			g == SelectedGood ? TEXT(">") : TEXT(" "), *G.Name,
			M->GetPrice(M->CurrentCity, g), M->GetStock(M->CurrentCity, g), Held ? *Held : 0),
			g == SelectedGood ? FLinearColor::Green : FLinearColor::White);
	}
	Y += 10.f;

	Line(TEXT("Destinations"), FLinearColor(0.7f, 0.7f, 0.7f));
	for (int32 c = 0; c < M->GetCities().Num(); ++c)
	{
		if (c == M->CurrentCity) { continue; }
		Line(FString::Printf(TEXT("%s %-12s %4.0f km"),
			c == SelectedCity ? TEXT(">") : TEXT(" "), *M->GetCities()[c].Name, M->DistanceKm(M->CurrentCity, c)),
			c == SelectedCity ? FLinearColor::Green : FLinearColor::White);
	}
	Y += 10.f;
	Line(M->LastMessage, FLinearColor(1.f, 0.7f, 0.3f));
	Line(TEXT("Up/Down: good   B: buy 5   S: sell 5   Left/Right: destination   Enter: travel"),
		FLinearColor(0.6f, 0.6f, 0.6f));
}
