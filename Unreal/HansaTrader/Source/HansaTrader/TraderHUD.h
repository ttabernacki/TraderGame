#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "TraderHUD.generated.h"

UCLASS()
class ATraderHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void DrawHUD() override;

	int32 SelectedGood = 0;
	int32 SelectedCity = 0;
};
