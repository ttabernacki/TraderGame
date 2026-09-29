#include "TraderPlayerController.h"
#include "MarketSubsystem.h"
#include "TraderHUD.h"
#include "Components/InputComponent.h"
#include "Engine/World.h"

ATraderPlayerController::ATraderPlayerController()
{
	bShowMouseCursor = true;
}

ATraderHUD* ATraderPlayerController::GetTraderHUD() const { return Cast<ATraderHUD>(GetHUD()); }
UMarketSubsystem* ATraderPlayerController::GetMarket() const { return GetWorld()->GetSubsystem<UMarketSubsystem>(); }

void ATraderPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();
	// Raw key bindings keep the prototype free of Input Mapping assets.
	InputComponent->BindKey(EKeys::Up, IE_Pressed, this, &ATraderPlayerController::MoveGood, -1);
	InputComponent->BindKey(EKeys::Down, IE_Pressed, this, &ATraderPlayerController::MoveGood, +1);
	InputComponent->BindKey(EKeys::Left, IE_Pressed, this, &ATraderPlayerController::MoveCity, -1);
	InputComponent->BindKey(EKeys::Right, IE_Pressed, this, &ATraderPlayerController::MoveCity, +1);
	InputComponent->BindKey(EKeys::B, IE_Pressed, this, &ATraderPlayerController::BuySelected);
	InputComponent->BindKey(EKeys::S, IE_Pressed, this, &ATraderPlayerController::SellSelected);
	InputComponent->BindKey(EKeys::Enter, IE_Pressed, this, &ATraderPlayerController::TravelSelected);
}

void ATraderPlayerController::MoveGood(int32 Delta)
{
	ATraderHUD* H = GetTraderHUD(); const UMarketSubsystem* M = GetMarket();
	if (!H || !M) { return; }
	const int32 N = M->GetGoods().Num();
	H->SelectedGood = (H->SelectedGood + Delta + N) % N;
}

void ATraderPlayerController::MoveCity(int32 Delta)
{
	ATraderHUD* H = GetTraderHUD(); const UMarketSubsystem* M = GetMarket();
	if (!H || !M) { return; }
	const int32 N = M->GetCities().Num();
	do { H->SelectedCity = (H->SelectedCity + Delta + N) % N; } while (H->SelectedCity == M->CurrentCity);
}

void ATraderPlayerController::BuySelected()
{
	if (ATraderHUD* H = GetTraderHUD()) { GetMarket()->Buy(H->SelectedGood, 5); }
}

void ATraderPlayerController::SellSelected()
{
	if (ATraderHUD* H = GetTraderHUD()) { GetMarket()->Sell(H->SelectedGood, 5); }
}

void ATraderPlayerController::TravelSelected()
{
	ATraderHUD* H = GetTraderHUD(); UMarketSubsystem* M = GetMarket();
	if (!H || !M) { return; }
	if (H->SelectedCity == M->CurrentCity) { MoveCity(+1); }
	M->TravelTo(H->SelectedCity);
	MoveCity(+1);
}
