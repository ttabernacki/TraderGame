using UnrealBuildTool;

public class HansaTraderEditorTarget : TargetRules
{
	public HansaTraderEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;
		ExtraModuleNames.Add("HansaTrader");
	}
}
