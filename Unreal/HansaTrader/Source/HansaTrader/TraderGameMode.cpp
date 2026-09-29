#include "TraderGameMode.h"
#include "TraderPlayerController.h"
#include "TraderHUD.h"
#include "GameFramework/SpectatorPawn.h"

ATraderGameMode::ATraderGameMode()
{
	PlayerControllerClass = ATraderPlayerController::StaticClass();
	HUDClass = ATraderHUD::StaticClass();
	DefaultPawnClass = ASpectatorPawn::StaticClass();
}
