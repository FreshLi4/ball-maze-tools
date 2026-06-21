#pragma once

#include "CoreMinimal.h"
#include "ISourceControlOperation.h"
#include "ISourceControlWorker.h"
#include "P4CommandLineSourceControlState.h"

class FP4CommandLineSourceControlCommand;

class FP4CommandLineSourceControlWorker : public ISourceControlWorker
{
public:
    virtual ~FP4CommandLineSourceControlWorker() = default;

    virtual FName GetName() const = 0;
    virtual bool Execute(FP4CommandLineSourceControlCommand& InCommand) = 0;
    virtual bool UpdateStates() const = 0;
};

class FGetP4SourceControlWorker
{
public:
    FGetP4SourceControlWorker() = default;
    FGetP4SourceControlWorker(TFunction<TSharedPtr<FP4CommandLineSourceControlWorker>()> InDelegate)
        : Delegate(InDelegate)
    {}

    TSharedPtr<FP4CommandLineSourceControlWorker> Execute() const
    {
        return Delegate.IsBound() ? Delegate.Execute() : nullptr;
    }

private:
    TFunction<TSharedPtr<FP4CommandLineSourceControlWorker>()> Delegate;
};

class FP4CommandLineCheckOut : public FCheckOut
{
public:
    static const FName GetName();
};

class FP4CommandLineRevert : public FRevert
{
public:
    static const FName GetName();
};

class FP4CommandLineAdd : public FAdd
{
public:
    static const FName GetName();
};

class FP4CommandLineDelete : public FDelete
{
public:
    static const FName GetName();
};

class FP4CommandLineMove : public FMove
{
public:
    static const FName GetName();
};

class FP4CommandLineSync : public FSync
{
public:
    static const FName GetName();
};

class FP4CommandLineUpdateStatus : public FUpdateStatus
{
public:
    static const FName GetName();
};

class FP4CommandLineCheckIn : public FCheckIn
{
public:
    static const FName GetName();
};

class FP4CommandLineHistory : public FHistory
{
public:
    static const FName GetName();
};

class FP4CommandLineAnnotate : public FAnnotate
{
public:
    static const FName GetName();
};
