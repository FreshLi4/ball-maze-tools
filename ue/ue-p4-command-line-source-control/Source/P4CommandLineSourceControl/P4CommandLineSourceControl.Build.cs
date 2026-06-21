using UnrealBuildTool;

public class P4CommandLineSourceControl : ModuleRules
{
    public P4CommandLineSourceControl(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

        PrivateDependencyModuleNames.AddRange(
            new string[] {
                "Core",
                "CoreUObject",
                "Engine",
                "Slate",
                "SlateCore",
                "EditorStyle",
                "Projects",
                "InputCore",
                "SourceControl"
            }
        );
    }
}
