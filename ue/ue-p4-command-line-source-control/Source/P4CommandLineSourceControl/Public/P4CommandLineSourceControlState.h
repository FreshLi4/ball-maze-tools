#pragma once

#include "CoreMinimal.h"
#include "ISourceControlState.h"
#include "ISourceControlRevision.h"

class FP4CommandLineSourceControlState : public ISourceControlState
{
public:
    FP4CommandLineSourceControlState(const FString& InLocalFilename)
        : LocalFilename(InLocalFilename)
    {}

    virtual FName GetStateIcon() const override;
    virtual FText GetStateText() const override;
    virtual FText GetDisplayName() const override;

    virtual bool IsCurrent() const override;
    virtual bool IsSourceControlled() const override;
    virtual bool IsAdded() const override;
    virtual bool IsDeleted() const override;
    virtual bool IsCheckedOut() const override;
    virtual bool IsCheckedOutOther(FString* OtherUserName = nullptr) const override;
    virtual bool IsModified() const override;
    virtual bool IsNew() const override;

    virtual bool CanAdd() const override;
    virtual bool CanDelete() const override;
    virtual bool CanCheckOut() const override;
    virtual bool CanRevert() const override;
    virtual bool CanCheckIn() const override;
    virtual bool CanDiffAgainstBase() const override;
    virtual bool CanDiffAgainstDepot() const override;
    virtual bool CanDiffAgainstLocal() const override;
    virtual bool CanHistory() const override;
    virtual bool CanUpdateStatus() const override;
    virtual bool CanSync() const override;
    virtual bool CanLock() const override;
    virtual bool CanUnlock() const override;
    virtual bool IsLocked() const override;
    virtual bool IsBinary() const override;
    virtual bool IsMoved() const override;
    virtual bool IsConflicted() const override;
    virtual bool IsHistorical() const override;
    virtual bool IsUnknown() const override;
    virtual bool IsIgnored() const override;
    virtual bool CanDeleteLocal() const override;
    virtual bool CanRevertCheckedOut() const override;
    virtual bool CanRevertUnchanged() const override;
    virtual bool CanRevertModified() const override;
    virtual bool CanSubmit() const override;
    virtual bool CanDiffAgainstWorkspace() const override;
    virtual bool CanDiffAgainstPrevious() const override;
    virtual bool CanDiffAgainstHead() const override;
    virtual bool IsUsingLocalFileRevisions() const override;
    virtual bool CanPreview() const override;
    virtual bool CanAddToIgnore() const override;
    virtual bool CanRemoveFromIgnore() const override;
    virtual bool CanAddToChangelist() const override;
    virtual bool IsUncontrolledChange() const override;
    virtual bool IsUnchecked() const override;
    virtual bool IsForbidCheckout() const override;
    virtual bool IsSlowTask() const override;
    virtual bool IsRedirector() const override;
    virtual bool CanShowInContentBrowser() const override;
    virtual bool CanShowInExplorer() const override;
    virtual bool CanShowInSystemShell() const override;
    virtual bool IsUASFiltered() const override;
    virtual bool IsPendingAdd() const override;

    virtual TArray<FSourceControlRevisionRef> GetHistory() const override;

    void Update(const FString& InAction, int32 InHeadRevision, int32 InHaveRevision, bool bInOtherOpen, const FString& InOtherUser);

    const FString& GetLocalFilename() const { return LocalFilename; }

private:
    FString LocalFilename;
    FString DepotFilename;
    FString Action;
    FString OtherUserCheckedOut;
    int32 HeadRevision = 0;
    int32 HaveRevision = 0;
    bool bOtherOpen = false;
    bool bCanDelete = false;
    bool bCanAdd = false;
    bool bCanCheckOut = false;
    bool bCanRevert = false;
    bool bCanCheckIn = false;
    bool bCanDiffAgainstWorkspace = false;
    TArray<FSourceControlRevisionRef> History;
};
