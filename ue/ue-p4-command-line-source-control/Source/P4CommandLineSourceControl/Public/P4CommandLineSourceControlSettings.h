#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "P4CommandLineSourceControlSettings.generated.h"

UCLASS(config = EditorPerProjectUserSettings)
class UP4CommandLineSourceControlSettings : public UObject
{
    GENERATED_BODY()

public:
    UP4CommandLineSourceControlSettings(const FObjectInitializer& ObjectInitializer);

    UPROPERTY(config, EditAnywhere, Category = "Perforce CLI")
    FString P4Port;

    UPROPERTY(config, EditAnywhere, Category = "Perforce CLI")
    FString P4User;

    UPROPERTY(config, EditAnywhere, Category = "Perforce CLI")
    FString P4Client;

    UPROPERTY(config, EditAnywhere, Category = "Perforce CLI")
    FString P4Password;

    UPROPERTY(config, EditAnywhere, Category = "Perforce CLI")
    FString P4ExecutablePath;

    void LoadSettings();
    void SaveSettings() const;

    FString GetP4Port() const;
    FString GetP4User() const;
    FString GetP4Client() const;
    FString GetP4Password() const;
    FString GetP4ExecutablePath() const;
};
