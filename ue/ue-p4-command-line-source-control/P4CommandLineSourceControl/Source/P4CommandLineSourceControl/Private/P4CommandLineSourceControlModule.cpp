#include "P4CommandLineSourceControlModule.h"
#include "P4CommandLineSourceControlProvider.h"
#include "Modules/ModuleManager.h"
#include "Features/IModularFeatures.h"

DEFINE_LOG_CATEGORY(LogP4CommandLine);

#define LOCTEXT_NAMESPACE "P4CommandLineSourceControl"

void FP4CommandLineSourceControlModule::StartupModule()
{
    IModularFeatures::Get().RegisterModularFeature("SourceControl", &SourceControlProvider);
}

void FP4CommandLineSourceControlModule::ShutdownModule()
{
    IModularFeatures::Get().UnregisterModularFeature("SourceControl", &SourceControlProvider);
    SourceControlProvider.Close();
}

IMPLEMENT_MODULE(FP4CommandLineSourceControlModule, P4CommandLineSourceControl)

#undef LOCTEXT_NAMESPACE
