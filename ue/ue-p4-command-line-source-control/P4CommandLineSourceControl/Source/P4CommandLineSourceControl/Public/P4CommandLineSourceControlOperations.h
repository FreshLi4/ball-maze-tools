#pragma once

#include "CoreMinimal.h"
#include "ISourceControlOperation.h"

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