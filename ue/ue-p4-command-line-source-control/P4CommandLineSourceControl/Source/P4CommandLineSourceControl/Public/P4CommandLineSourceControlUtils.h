#pragma once

#include "CoreMinimal.h"
#include "P4CommandLineSourceControlState.h"
#include "P4CommandLineSourceControlRevision.h"

class FP4CommandLineSourceControlUtils
{
public:
    static bool ParseStatusResult(const FString& InResults, TArray<FSourceControlStateRef>& OutStates);
    static bool ParseFileLogResult(const FString& InResults, TArray<TSharedRef<FP4CommandLineSourceControlRevision, ESPMode::ThreadSafe>>& OutRevisions);
    static bool ParseAnnotateResult(const FString& InResults, TArray<FAnnotationLine>& OutLines);
    static bool ParseInfoResult(const FString& InResults, FString& OutUserName, FString& OutClientName, FString& OutServerAddress);

    static bool RunP4Command(const FString& InCommand, const FString& InParameters, FString& OutResults, FString& OutErrors, int32& OutReturnCode);
    static bool RunP4Command(const FString& InCommand, const FString& InParameters, const FString& InP4Port, const FString& InP4User, const FString& InP4Client, const FString& InP4Password, FString& OutResults, FString& OutErrors, int32& OutReturnCode);
    static FString GetP4ExecutablePath();

    static FString SanitizeFilename(const FString& InFilename);
    static FString GetDepotPath(const FString& InLocalFilename);
    static FString GetLocalPath(const FString& InDepotFilename);
};
