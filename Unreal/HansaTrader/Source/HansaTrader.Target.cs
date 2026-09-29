using UnrealBuildTool;

public class HansaTraderTarget : TargetRules
{
	public HansaTraderTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;
		ExtraModuleNames.Add("HansaTrader");
	}
}
