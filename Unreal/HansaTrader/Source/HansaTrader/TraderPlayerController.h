#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "TraderPlayerController.generated.h"

UCLASS()
class ATraderPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	ATraderPlayerController();

protected:
	virtual void SetupInputComponent() override;

private:
	void MoveGood(int32 Delta);
	void MoveCity(int32 Delta);
	void BuySelected();
	void SellSelected();
	void TravelSelected();
	class ATraderHUD* GetTraderHUD() const;
	class UMarketSubsystem* GetMarket() const;
};
