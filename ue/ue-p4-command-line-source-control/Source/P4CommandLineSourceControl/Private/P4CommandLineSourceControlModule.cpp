#include "P4CommandLineSourceControlModule.h"
#include "P4CommandLineSourceControlProvider.h"
#include "Modules/ModuleManager.h"
#include "SourceControlModule.h"

#define LOCTEXT_NAMESPACE "P4CommandLineSourceControl"

void FP4CommandLineSourceControlModule::StartupModule()
{
    SourceControlProvider = MakeShareable(new FP4CommandLineSourceControlProvider());

    FSourceControlModule& SourceControlModule = FSourceControlModule::Get();
    SourceControlModule.RegisterProvider(FName("P4CommandLine"), SourceControlProvider);
}

void FP4CommandLineSourceControlModule::ShutdownModule()
{
    FSourceControlModule& SourceControlModule = FSourceControlModule::Get();
    SourceControlModule.UnregisterProvider(FName("P4CommandLine"));

    SourceControlProvider.Reset();
}

IMPLEMENT_MODULE(FP4CommandLineSourceControlModule, P4CommandLineSourceControl)

#undef LOCTEXT_NAMESPACE
