#pragma once

#include "CoreMinimal.h"
#include "ISourceControlProvider.h"
#include "P4CommandLineSourceControlSettings.h"

class FP4CommandLineSourceControlState;

class FP4CommandLineSourceControlProvider : public ISourceControlProvider
{
public:
    FP4CommandLineSourceControlProvider();

    using ISourceControlProvider::Execute;

    // ISourceControlProvider interface
    virtual void Init(bool bForceConnection = true) override;
    virtual void Close() override;
    virtual FText GetStatusText() const override;
    virtual TMap<EStatus, FString> GetStatus() const override;
    virtual bool IsEnabled() const override;
    virtual bool IsAvailable() const override;
    virtual const FName& GetName() const override;
    virtual bool QueryStateBranchConfig(const FString& ConfigSrc, const FString& ConfigDest) override;
    virtual void RegisterStateBranches(const TArray<FString>& BranchNames, const FString& ContentRoot) override;
    virtual int32 GetStateBranchIndex(const FString& InBranchName) const override;
    virtual ECommandResult::Type GetState(const TArray<FString>& InFiles, TArray<FSourceControlStateRef>& OutState, EStateCacheUsage::Type InStateCacheUsage) override;
    virtual ECommandResult::Type GetState(const TArray<FSourceControlChangelistRef>& InChangelists, TArray<FSourceControlChangelistStateRef>& OutState, EStateCacheUsage::Type InStateCacheUsage) override;
    virtual TArray<FSourceControlStateRef> GetCachedStateByPredicate(TFunctionRef<bool(const FSourceControlStateRef&)> Predicate) const override;
    virtual FDelegateHandle RegisterSourceControlStateChanged_Handle(const FSourceControlStateChanged::FDelegate& SourceControlStateChanged) override;
    virtual void UnregisterSourceControlStateChanged_Handle(FDelegateHandle Handle) override;
    virtual ECommandResult::Type Execute(const FSourceControlOperationRef& InOperation, FSourceControlChangelistPtr InChangelist, const TArray<FString>& InFiles, EConcurrency::Type InConcurrency, const FSourceControlOperationComplete& InOperationCompleteDelegate) override;
    virtual bool CanExecuteOperation(const FSourceControlOperationRef& InOperation) const override;
    virtual bool CanCancelOperation(const FSourceControlOperationRef& InOperation) const override;
    virtual void CancelOperation(const FSourceControlOperationRef& InOperation) override;
    virtual bool UsesLocalReadOnlyState() const override;
    virtual bool UsesChangelists() const override;
    virtual bool UsesUncontrolledChangelists() const override;
    virtual bool UsesCheckout() const override;
    virtual bool UsesFileRevisions() const override;
    virtual bool UsesSnapshots() const override;
    virtual bool AllowsDiffAgainstDepot() const override;
    virtual TOptional<bool> IsAtLatestRevision() const override;
    virtual TOptional<int> GetNumLocalChanges() const override;
    virtual void Tick() override;
    virtual TArray<TSharedRef<class ISourceControlLabel>> GetLabels(const FString& InMatchingSpec) const override;
    virtual TArray<FSourceControlChangelistRef> GetChangelists(EStateCacheUsage::Type InStateCacheUsage) override;
#if SOURCE_CONTROL_WITH_SLATE
    virtual TSharedRef<class SWidget> MakeSettingsWidget() const override;
#endif

private:
    bool CheckP4Availability();
    TSharedRef<FP4CommandLineSourceControlState> GetStateInternal(const FString& Filename);
    void GetCredentials(FString& OutP4Port, FString& OutP4User, FString& OutP4Client, FString& OutP4Password) const;

    bool bSourceControlAvailable;
    FName ProviderName;
    TMap<FString, TSharedRef<FP4CommandLineSourceControlState>> StateCache;
    FSourceControlStateChanged OnSourceControlStateChanged;
    TStrongObjectPtr<UP4CommandLineSourceControlSettings> Settings;
};