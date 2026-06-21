#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleInterface.h"
#include "P4CommandLineSourceControlProvider.h"

DECLARE_LOG_CATEGORY_EXTERN(LogP4CommandLine, Log, All);

class FP4CommandLineSourceControlModule : public IModuleInterface
{
public:
    virtual void StartupModule() override;
    virtual void ShutdownModule() override;

private:
    FP4CommandLineSourceControlProvider SourceControlProvider;
};
