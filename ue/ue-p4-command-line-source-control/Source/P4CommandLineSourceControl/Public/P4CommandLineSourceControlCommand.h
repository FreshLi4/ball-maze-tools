#pragma once

#include "CoreMinimal.h"

class FP4CommandLineSourceControlCommand
{
public:
    FP4CommandLineSourceControlCommand(const FString& InCommand, const FString& InParameters);

    bool RunCommand();

    const FString& GetCommand() const { return Command; }
    const FString& GetParameters() const { return Parameters; }
    const FString& GetResults() const { return Results; }
    const FString& GetErrors() const { return Errors; }
    int32 GetReturnCode() const { return ReturnCode; }

    FString Results;
    FString Errors;

private:
    FString Command;
    FString Parameters;
    int32 ReturnCode = -1;
    float Timeout = 30.0f;
};
